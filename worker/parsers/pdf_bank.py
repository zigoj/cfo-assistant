"""
PDF bank statement parser.
Strategy:
  1. Try pdfplumber table extraction (works for most digital PDFs)
  2. Fall back to line-by-line text + regex
  3. For any row with confidence < 0.7, batch-send to Claude Haiku for disambiguation
"""
import re
import logging
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
import pdfplumber
import anthropic

log = logging.getLogger(__name__)

# ── Transaction dataclass ────────────────────────────────────────────────────

@dataclass
class Transaction:
    txn_date:    datetime
    description: str
    debit:       Optional[float] = None
    credit:      Optional[float] = None
    balance:     Optional[float] = None
    currency:    str = "GBP"
    counterparty: Optional[str] = None
    reference:   Optional[str] = None
    # Set by rules engine
    category:    Optional[str] = None
    pl_line:     Optional[str] = None
    cf_type:     Optional[str] = None
    rule_id:     Optional[str] = None
    confidence:  float = 0.0
    flags:       list = field(default_factory=list)
    raw:         str = ""

    def to_db_row(self, report_id: str, org_id: str) -> dict:
        return {
            "report_id":   report_id,
            "org_id":      org_id,
            "txn_date":    self.txn_date.date().isoformat(),
            "description": self.description,
            "counterparty": self.counterparty,
            "reference":   self.reference,
            "debit":       self.debit,
            "credit":      self.credit,
            "balance":     self.balance,
            "currency":    self.currency,
            "category":    self.category,
            "pl_line":     self.pl_line,
            "cf_type":     self.cf_type,
            "rule_id":     self.rule_id,
            "confidence":  self.confidence,
            "flags":       self.flags,
        }


# ── Bank-specific column configs ─────────────────────────────────────────────

BANK_TEMPLATES = {
    "barclays":  {"date": 0, "description": 1, "debit": 2, "credit": 3, "balance": 4, "date_fmt": "%d/%m/%Y"},
    "hsbc":      {"date": 0, "description": 1, "debit": 2, "credit": 3, "balance": 4, "date_fmt": "%d %b %Y"},
    "lloyds":    {"date": 0, "description": 1, "type": 2, "debit": 3, "credit": 4, "balance": 5, "date_fmt": "%d/%m/%Y"},
    "monzo":     {"date": 0, "description": 2, "debit": 4, "credit": 5, "balance": 6, "date_fmt": "%d/%m/%Y"},
    "starling":  {"date": 0, "description": 1, "debit": 3, "credit": 4, "balance": 5, "date_fmt": "%Y-%m-%d"},
    "generic":   {"date": 0, "description": 1, "debit": 2, "credit": 3, "balance": 4, "date_fmt": "%d/%m/%Y"},
}

# Regex patterns
RE_DATE_DMY  = re.compile(r"\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b")
RE_DATE_DMon = re.compile(r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{2,4})\b", re.I)
RE_AMOUNT    = re.compile(r"([\-\+]?£?[\d,]+\.\d{2})")
RE_CLEAN_AMT = re.compile(r"[£,\s]")


def parse_bank_pdf(path: str) -> list[Transaction]:
    log.info(f"Parsing bank PDF: {path}")
    transactions: list[Transaction] = []

    with pdfplumber.open(path) as pdf:
        template = _detect_bank_template(pdf)
        log.info(f"Detected bank template: {template}")
        cfg = BANK_TEMPLATES.get(template, BANK_TEMPLATES["generic"])

        for page in pdf.pages:
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    for row in table:
                        t = _parse_table_row(row, cfg)
                        if t:
                            transactions.append(t)
            else:
                # Text fallback
                text = page.extract_text() or ""
                for line in text.splitlines():
                    t = _parse_text_line(line.strip(), cfg)
                    if t:
                        transactions.append(t)

    transactions = [t for t in transactions if t is not None]
    log.info(f"Extracted {len(transactions)} transactions before LLM pass")

    # LLM disambiguation for low-confidence rows
    low_conf = [t for t in transactions if t.confidence < 0.7]
    if low_conf:
        _llm_enrich(low_conf)

    return transactions


def _detect_bank_template(pdf) -> str:
    """Heuristic: scan first page text for bank name keywords."""
    text = (pdf.pages[0].extract_text() or "").lower()
    for bank in ["barclays", "hsbc", "lloyds", "monzo", "starling"]:
        if bank in text:
            return bank
    return "generic"


def _parse_table_row(row: list, cfg: dict) -> Optional[Transaction]:
    if not row or len(row) < 3:
        return None
    try:
        raw_date = _cell(row, cfg.get("date", 0))
        raw_desc = _cell(row, cfg.get("description", 1))
        if not raw_date or not raw_desc:
            return None

        txn_date = _parse_date(raw_date, cfg.get("date_fmt", "%d/%m/%Y"))
        if not txn_date:
            return None

        debit  = _parse_amount(_cell(row, cfg.get("debit", 2)))
        credit = _parse_amount(_cell(row, cfg.get("credit", 3)))
        balance = _parse_amount(_cell(row, cfg.get("balance", 4)))

        if debit is None and credit is None:
            return None

        return Transaction(
            txn_date=txn_date,
            description=raw_desc.strip(),
            debit=debit,
            credit=credit,
            balance=balance,
            confidence=0.9,
            raw=str(row),
        )
    except Exception:
        return None


def _parse_text_line(line: str, cfg: dict) -> Optional[Transaction]:
    """Regex-based fallback for unstructured text."""
    date_match = RE_DATE_DMY.search(line) or RE_DATE_DMon.search(line)
    if not date_match:
        return None

    amounts = RE_AMOUNT.findall(line)
    if not amounts:
        return None

    try:
        txn_date = _parse_date(date_match.group(0), cfg.get("date_fmt", "%d/%m/%Y"))
        if not txn_date:
            return None

        # Remove date and amounts from line to get description
        desc = line
        desc = re.sub(RE_DATE_DMY.pattern, "", desc)
        for a in amounts:
            desc = desc.replace(a, "")
        desc = re.sub(r"\s{2,}", " ", desc).strip(" -|,")

        parsed_amounts = []
        for a in amounts:
            v = _parse_amount(a)
            if v is not None:
                parsed_amounts.append(v)

        debit  = parsed_amounts[0] if parsed_amounts and parsed_amounts[0] < 0 else None
        credit = parsed_amounts[0] if parsed_amounts and parsed_amounts[0] > 0 else None
        if len(parsed_amounts) > 1:
            credit = parsed_amounts[1] if parsed_amounts[1] > 0 else credit
            debit  = parsed_amounts[1] if parsed_amounts[1] < 0 else debit

        return Transaction(
            txn_date=txn_date,
            description=desc,
            debit=abs(debit) if debit else None,
            credit=credit,
            confidence=0.6,
            raw=line,
        )
    except Exception:
        return None


def _llm_enrich(transactions: list[Transaction]) -> None:
    """Batch low-confidence rows to Claude Haiku for counterparty + category hints."""
    client = anthropic.Anthropic()
    rows_text = "\n".join(
        f"{i}. {t.txn_date.date()} | {t.description} | debit:{t.debit} credit:{t.credit}"
        for i, t in enumerate(transactions)
    )
    prompt = f"""You are a UK accounting expert. For each bank transaction row below, identify:
- counterparty: the vendor/payer name (clean form, e.g. "Amazon", "HMRC", "Acme Ltd")
- ref: any invoice/reference number found in the description
- category_hint: one of [Staff Costs, Property Costs, Marketing, Technology, Professional Fees,
  Loan/Finance, Tax, Revenue, Intercompany, Other]

Return JSON array with same indexes: [{{"i":0,"counterparty":"...","ref":"...","category_hint":"..."}}]
Only return the JSON array, nothing else.

Transactions:
{rows_text}"""

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        import json
        enrichments = json.loads(msg.content[0].text)
        for e in enrichments:
            t = transactions[e["i"]]
            t.counterparty = e.get("counterparty") or t.counterparty
            t.reference    = e.get("ref") or t.reference
            # category_hint stored on description for rules engine to use
            if e.get("category_hint"):
                t.raw = t.raw + f" [hint:{e['category_hint']}]"
            t.confidence = max(t.confidence, 0.75)
    except Exception as ex:
        log.warning(f"LLM enrichment failed: {ex}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cell(row: list, idx: int) -> Optional[str]:
    try:
        v = row[idx]
        return str(v).strip() if v else None
    except IndexError:
        return None


def _parse_date(s: str, fmt: str) -> Optional[datetime]:
    if not s:
        return None
    for f in [fmt, "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d %b %Y", "%d %B %Y"]:
        try:
            return datetime.strptime(s.strip(), f)
        except ValueError:
            continue
    return None


def _parse_amount(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    cleaned = RE_CLEAN_AMT.sub("", str(s)).strip()
    if not cleaned or cleaned in ("-", ""):
        return None
    try:
        v = float(cleaned)
        return v if v != 0 else None
    except ValueError:
        return None
