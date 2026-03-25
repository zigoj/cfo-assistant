"""
P&L parser — supports Excel (.xlsx/.xls) and CSV.
Strategy: detect header row, map columns to canonical schema, infer section labels.
"""
import logging
import re
from pathlib import Path
from typing import Optional

import pandas as pd

log = logging.getLogger(__name__)

# Canonical P&L sections (in order)
SECTIONS = ["Revenue", "Cost of Sales", "Gross Profit", "Operating Expenses", "EBITDA", "Net Profit"]

# Keywords → canonical section mapping
SECTION_KEYWORDS = {
    "Revenue":             ["revenue", "income", "sales", "turnover"],
    "Cost of Sales":       ["cost of sales", "cogs", "cost of goods", "direct costs"],
    "Gross Profit":        ["gross profit", "gross margin"],
    "Operating Expenses":  ["operating expenses", "opex", "overhead", "expenses", "admin"],
    "EBITDA":              ["ebitda", "operating profit", "operating income"],
    "Net Profit":          ["net profit", "net income", "profit after tax", "bottom line"],
}

# Column name synonyms → canonical fields
COL_SYNONYMS = {
    "label":   ["label", "description", "account name", "line item", "item name", "narrative", "account", "name"],
    "value":   ["amount", "actual", "value", "total", "£", "gbp", "eur", "usd"],
    "gl_code": ["account code", "gl code", "account no", "account number", "nominal", "code"],
    "budget":  ["budget", "plan", "forecast"],
    "prior":   ["prior", "last year", "py", "prior year", "ly"],
    "section": ["section", "category group", "heading", "group"],
}


def parse_pl(path: str) -> list[dict]:
    log.info(f"Parsing P&L: {path}")
    suffix = Path(path).suffix.lower()

    if suffix in (".xlsx", ".xls"):
        df = _read_excel(path)
    else:
        df = _read_csv(path)

    if df is None or df.empty:
        log.warning("P&L file produced empty dataframe")
        return []

    lines = _normalize_df(df)
    log.info(f"Parsed {len(lines)} P&L lines")
    return lines


def _read_excel(path: str) -> Optional[pd.DataFrame]:
    """Try each sheet; use the first one with ≥5 rows of data."""
    xl = pd.ExcelFile(path)
    for sheet in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet, header=None)
        if len(df) >= 5:
            return df
    return None


def _read_csv(path: str) -> pd.DataFrame:
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            return pd.read_csv(path, header=None, encoding=enc)
        except UnicodeDecodeError:
            continue
    return pd.read_csv(path, header=None, encoding="utf-8", errors="replace")


def _normalize_df(df: pd.DataFrame) -> list[dict]:
    """Find header row, map columns, extract lines with section labels."""
    header_row = _find_header_row(df)
    if header_row is None:
        log.warning("Could not detect header row — using row 0")
        header_row = 0

    df.columns = df.iloc[header_row].astype(str).str.strip().str.lower()
    df = df.iloc[header_row + 1:].reset_index(drop=True)
    df = df.dropna(how="all")

    col_map = _map_columns(df.columns.tolist())
    label_col   = col_map.get("label")
    value_col   = col_map.get("value")
    gl_col      = col_map.get("gl_code")
    budget_col  = col_map.get("budget")
    prior_col   = col_map.get("prior")
    section_col = col_map.get("section")   # explicit Section column if present

    if not label_col or not value_col:
        log.warning(f"Could not find label/value columns. Columns: {df.columns.tolist()}")
        return []

    lines = []
    current_section = "Operating Expenses"

    for _, row in df.iterrows():
        raw_label = str(row.get(label_col, "")).strip()
        if not raw_label or raw_label.lower() in ("nan", "none", ""):
            continue

        # Use explicit section column when available
        if section_col:
            raw_section = str(row.get(section_col, "")).strip()
            detected = _detect_section(raw_section) if raw_section else None
            if detected:
                current_section = detected
        else:
            # Fall back to detecting section from label row
            detected_section = _detect_section(raw_label)
            if detected_section:
                current_section = detected_section
                continue

        raw_value = row.get(value_col)
        value = _safe_float(raw_value)
        if value is None:
            continue

        line: dict = {
            "label":   raw_label,
            "value":   value,
            "section": current_section,
            "gl_code": str(row.get(gl_col, "")).strip() if gl_col else None,
            "budget":  _safe_float(row.get(budget_col)) if budget_col else None,
            "prior":   _safe_float(row.get(prior_col)) if prior_col else None,
        }
        lines.append(line)

    # Infer gross profit / EBITDA if not present
    lines = _infer_subtotals(lines)
    return lines


def _find_header_row(df: pd.DataFrame) -> Optional[int]:
    """Return the index of the row most likely to be the header."""
    for i, row in df.iterrows():
        values = [str(v).lower().strip() for v in row if pd.notna(v)]
        hits = sum(1 for v in values if any(s in v for synonyms in COL_SYNONYMS.values() for s in synonyms))
        if hits >= 2:
            return i
    return None


def _map_columns(cols: list[str]) -> dict[str, str]:
    """Return {canonical_name: actual_col_name}."""
    mapping = {}
    for canon, synonyms in COL_SYNONYMS.items():
        for col in cols:
            if any(s in col for s in synonyms):
                mapping[canon] = col
                break
    return mapping


def _detect_section(label: str) -> Optional[str]:
    lower = label.lower().strip()
    # Exact match first — prevents "Cost of Sales" matching "Revenue" via "sales"
    for section in SECTIONS:
        if section.lower() == lower:
            return section
    for section, keywords in SECTION_KEYWORDS.items():
        if any(k in lower for k in keywords):
            return section
    return None


def _infer_subtotals(lines: list[dict]) -> list[dict]:
    by_section: dict[str, float] = {}
    for l in lines:
        by_section.setdefault(l["section"], 0)
        by_section[l["section"]] += l["value"]

    revenue = by_section.get("Revenue", 0)
    cogs    = by_section.get("Cost of Sales", 0)
    opex    = by_section.get("Operating Expenses", 0)

    # Add computed totals only if missing
    sections_present = {l["section"] for l in lines}
    if "Gross Profit" not in sections_present:
        lines.append({"label": "Gross Profit", "value": revenue - abs(cogs), "section": "Gross Profit",
                       "gl_code": None, "budget": None, "prior": None})
    if "EBITDA" not in sections_present:
        gp = revenue - abs(cogs)
        lines.append({"label": "EBITDA", "value": gp - abs(opex), "section": "EBITDA",
                       "gl_code": None, "budget": None, "prior": None})
    return lines


def _safe_float(v) -> Optional[float]:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        cleaned = re.sub(r"[£$€,\s()]", "", str(v)).strip()
        if cleaned.startswith("-") or cleaned.endswith("-"):
            cleaned = "-" + cleaned.strip("-")
        return float(cleaned) if cleaned not in ("", "-") else None
    except (ValueError, TypeError):
        return None
