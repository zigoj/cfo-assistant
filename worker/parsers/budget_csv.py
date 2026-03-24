"""
Budget CSV parser.

Expected format (flexible):
  Account [Code], Description, Budget [Amount]
  e.g.
    4000, Revenue,        50000
    5000, Cost of Sales,  18000
    6000, Salaries,       12000

Outputs a list of dicts:
  { "gl_code": str | None, "label": str, "budget": float }
"""
import logging
import re
from pathlib import Path
from typing import Optional

import pandas as pd


def _read_excel(path: str) -> Optional[pd.DataFrame]:
    xl = pd.ExcelFile(path)
    for sheet in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet, header=None)
        if len(df) >= 2:
            return df
    return None

log = logging.getLogger(__name__)

_LABEL_SYNONYMS  = ["description", "account", "name", "category", "line item", "narrative"]
_BUDGET_SYNONYMS = ["budget", "plan", "forecast", "budgeted"]
_CODE_SYNONYMS   = ["code", "account code", "gl code", "nominal", "account no", "account number"]


def parse_budget(path: str) -> list[dict]:
    log.info(f"Parsing budget: {path}")
    suffix = Path(path).suffix.lower()
    if suffix in (".xlsx", ".xls"):
        df = _read_excel(path)
    else:
        df = _read(path)
    if df is None or df.empty:
        log.warning("Budget file produced empty dataframe")
        return []
    return _normalize(df)


def _read(path: str) -> Optional[pd.DataFrame]:
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            return pd.read_csv(path, header=None, encoding=enc)
        except UnicodeDecodeError:
            continue
    return pd.read_csv(path, header=None, encoding="utf-8", errors="replace")


def _normalize(df: pd.DataFrame) -> list[dict]:
    header_row = _find_header(df)
    if header_row is None:
        log.warning("No header row detected in budget CSV — using row 0")
        header_row = 0

    df.columns = df.iloc[header_row].astype(str).str.strip().str.lower()
    df = df.iloc[header_row + 1:].reset_index(drop=True).dropna(how="all")

    label_col  = _pick(df.columns, _LABEL_SYNONYMS)
    budget_col = _pick(df.columns, _BUDGET_SYNONYMS)
    code_col   = _pick(df.columns, _CODE_SYNONYMS)

    if not label_col or not budget_col:
        log.warning(f"Cannot find label/budget columns. Available: {df.columns.tolist()}")
        return []

    lines = []
    for _, row in df.iterrows():
        label = str(row.get(label_col, "")).strip()
        if not label or label.lower() in ("nan", "none", ""):
            continue
        amount = _safe_float(row.get(budget_col))
        if amount is None:
            continue
        lines.append({
            "gl_code": str(row.get(code_col, "")).strip() if code_col else None,
            "label":   label,
            "budget":  amount,
        })

    log.info(f"Parsed {len(lines)} budget lines")
    return lines


def _find_header(df: pd.DataFrame) -> Optional[int]:
    all_synonyms = _LABEL_SYNONYMS + _BUDGET_SYNONYMS + _CODE_SYNONYMS
    for i, row in df.iterrows():
        values = [str(v).lower().strip() for v in row if pd.notna(v)]
        if sum(1 for v in values if any(s in v for s in all_synonyms)) >= 2:
            return i
    return None


def _pick(cols, synonyms: list[str]) -> Optional[str]:
    for col in cols:
        if any(s in col for s in synonyms):
            return col
    return None


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
