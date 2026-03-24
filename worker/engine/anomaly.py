"""Anomaly detection — runs anomaly-type rules against the categorized transaction set."""
import json
import logging
import re
import statistics
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)
RULES_PATH = Path(__file__).parent.parent / "rules" / "default_rules.json"


@dataclass
class Anomaly:
    txn_date:       str
    description:    str
    amount:         float
    flag:           str
    severity:       str
    message:        str
    suggested_entry: Optional[str] = None


def detect_anomalies(transactions: list) -> list[Anomaly]:
    with open(RULES_PATH) as f:
        rules_data = json.load(f)

    anom_rules = [r for r in rules_data["rules"] if r.get("type") == "anomaly"]
    anomalies: list[Anomaly] = []

    debits = [abs(t.debit) for t in transactions if t.debit]
    mean_debit = statistics.mean(debits) if debits else 0
    std_debit  = statistics.stdev(debits) if len(debits) > 1 else 0

    for txn in transactions:
        for rule in anom_rules:
            if _matches_anomaly_rule(rule, txn, transactions, mean_debit, std_debit):
                action = rule["action"]
                anomalies.append(Anomaly(
                    txn_date=       txn.txn_date.date().isoformat(),
                    description=    txn.description,
                    amount=         abs(txn.debit or txn.credit or 0),
                    flag=           action["flag"],
                    severity=       action["severity"],
                    message=        action["message"],
                    suggested_entry=action.get("suggested_entry"),
                ))
                # Attach flag to transaction object too
                txn.flags.append({
                    "type":           action["flag"],
                    "severity":       action["severity"],
                    "message":        action["message"],
                    "suggested_entry": action.get("suggested_entry"),
                })
                break  # one anomaly per transaction (highest-priority rule wins)

    log.info(f"Detected {len(anomalies)} anomalies")
    return anomalies


def _matches_anomaly_rule(rule: dict, txn, all_txns: list, mean: float, std: float) -> bool:
    cond = rule.get("conditions", {})
    op   = cond.get("operator", "AND")
    tests = cond.get("tests", [])
    results = [_test(t, txn, all_txns, mean, std) for t in tests]
    return all(results) if op == "AND" else any(results)


def _test(test: dict, txn, all_txns: list, mean: float, std: float) -> bool:
    field = test["field"]
    op    = test["op"]

    val = _field_val(txn, field)

    if op == "eq":
        return str(val or "").lower() == str(test.get("value", "")).lower()

    if op == "gt":
        return (val or 0) > test["value"]

    if op == "gt_zscore":
        if std == 0:
            return False
        z = (abs(txn.debit or 0) - mean) / std
        return z > test.get("threshold", 2.5)

    if op == "is_round":
        divisor = test.get("divisor", 1000)
        return (abs(txn.debit or txn.credit or 0) % divisor) == 0

    if op == "not_between":
        lo, hi = test["min"], test["max"]
        v = val or 0
        if lo <= hi:
            return not (lo <= v <= hi)
        return not (v >= lo or v <= hi)

    if op == "not_regex":
        return not bool(re.search(test["pattern"], str(val or ""), re.I))

    if op == "matches_prior_within_days":
        days   = test.get("days", 5)
        amount = abs(txn.debit or 0)
        for other in all_txns:
            if other is txn:
                continue
            if abs(abs(other.debit or 0) - amount) > 0.01:
                continue
            if abs((txn.txn_date - other.txn_date).days) <= days:
                return True
        return False

    if op == "similarity_gte":
        desc   = str(txn.description or "")
        amount = abs(txn.debit or 0)
        for other in all_txns:
            if other is txn:
                continue
            if abs(abs(other.debit or 0) - amount) > 0.01:
                continue
            ratio = SequenceMatcher(None, desc.upper(), str(other.description or "").upper()).ratio()
            if ratio >= test["threshold"]:
                return True
        return False

    return False


def _field_val(txn, field: str):
    if field == "direction":    return "debit" if (txn.debit or 0) > 0 else "credit"
    if field == "amount":       return abs(txn.debit or txn.credit or 0)
    if field == "category":     return txn.category
    if field == "day_of_month": return txn.txn_date.day
    if field == "description":  return txn.description
    return getattr(txn, field, None)
