"""
Trial balance / GL CSV parser.
Expected columns: code, name/description, debit, credit OR balance
"""
import logging
import re
from typing import Optional
import pandas as pd

log = logging.getLogger(__name__)

COL_SYNONYMS = {
    "code":    ["code", "account code", "account no", "gl code", "nominal", "account"],
    "name":    ["name", "description", "account name", "account description", "narrative"],
    "debit":   ["debit", "dr", "debit balance"],
    "credit":  ["credit", "cr", "credit balance"],
    "balance": ["balance", "net balance", "amount", "total"],
}


def parse_trial_balance(path: str) -> list[dict]:
    log.info(f"Parsing trial balance: {path}")
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            df = pd.read_csv(path, encoding=enc)
            break
        except UnicodeDecodeError:
            continue

    df.columns = df.columns.str.strip().str.lower()
    col_map = {}
    for canon, synonyms in COL_SYNONYMS.items():
        for col in df.columns:
            if any(s in col for s in synonyms):
                col_map[canon] = col
                break

    code_col    = col_map.get("code")
    name_col    = col_map.get("name")
    debit_col   = col_map.get("debit")
    credit_col  = col_map.get("credit")
    balance_col = col_map.get("balance")

    lines = []
    for _, row in df.iterrows():
        code = str(row.get(code_col, "")).strip() if code_col else ""
        name = str(row.get(name_col, "")).strip() if name_col else ""
        if not code and not name:
            continue

        # Resolve balance
        if balance_col:
            balance = _safe_float(row.get(balance_col))
        else:
            dr = _safe_float(row.get(debit_col)) or 0
            cr = _safe_float(row.get(credit_col)) or 0
            balance = dr - cr

        if balance is None:
            balance = 0.0

        lines.append({"code": code, "name": name, "balance": balance})

    log.info(f"Parsed {len(lines)} TB lines")
    return lines


def _safe_float(v) -> Optional[float]:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        cleaned = re.sub(r"[£$€,\s()]", "", str(v)).strip()
        return float(cleaned) if cleaned not in ("", "-") else None
    except (ValueError, TypeError):
        return None
