"""
Rules engine — loads JSON rules (global defaults + org overrides) and categorizes transactions.
"""
import json
import re
import logging
from pathlib import Path
from difflib import SequenceMatcher

log = logging.getLogger(__name__)

RULES_PATH = Path(__file__).parent.parent / "rules" / "default_rules.json"


class RulesEngine:
    def __init__(self, org_id: str, supabase=None):
        self.org_id   = org_id
        self.supabase = supabase
        self.rules    = self._load_rules()
        self.fallback = self.rules.get("fallback", {})

    def _load_rules(self) -> dict:
        with open(RULES_PATH) as f:
            default = json.load(f)

        if not self.supabase:
            return default

        # Merge org-specific rule overrides from DB
        try:
            res = (self.supabase.table("categorization_rules")
                   .select("*")
                   .or_(f"org_id.eq.{self.org_id},org_id.is.null")
                   .eq("is_active", True)
                   .execute())
            overrides = {r["rule_key"]: r for r in (res.data or [])}
            for rule in default["rules"]:
                if rule["id"] in overrides:
                    override = overrides[rule["id"]]
                    rule.update({
                        "priority":   override.get("priority", rule["priority"]),
                        "conditions": override.get("conditions", rule["conditions"]),
                        "action":     override.get("action", rule["action"]),
                    })
        except Exception as ex:
            log.warning(f"Could not load org rule overrides: {ex}")

        # Sort by priority descending (higher = evaluated first)
        default["rules"].sort(key=lambda r: r.get("priority", 0), reverse=True)
        return default

    def categorize(self, transactions: list) -> list:
        cat_rules = [r for r in self.rules["rules"] if r.get("type", "categorize") == "categorize"]
        for txn in transactions:
            matched = False
            for rule in cat_rules:
                if self._evaluate_conditions(rule["conditions"], txn, transactions):
                    action = rule["action"]
                    txn.category   = action.get("category", self.fallback.get("category"))
                    txn.pl_line    = action.get("pl_line",   self.fallback.get("pl_line"))
                    txn.cf_type    = action.get("cf_type",   self.fallback.get("cf_type"))
                    txn.rule_id    = rule["id"]
                    txn.confidence = action.get("confidence", 0.8)
                    matched = True
                    break
            if not matched:
                txn.category   = self.fallback.get("category", "Unclassified")
                txn.pl_line    = self.fallback.get("pl_line", "9999 - Suspense")
                txn.cf_type    = self.fallback.get("cf_type", "unclassified")
                txn.rule_id    = "fallback"
                txn.confidence = 0.0
        return transactions

    def _evaluate_conditions(self, cond: dict, txn, all_txns: list) -> bool:
        operator = cond.get("operator", "AND")
        tests    = cond.get("tests", [])
        results  = [self._evaluate_test(t, txn, all_txns) for t in tests]
        return all(results) if operator == "AND" else any(results)

    def _evaluate_test(self, test: dict, txn, all_txns: list) -> bool:
        field = test["field"]
        op    = test["op"]
        val   = self._get_field(txn, field)

        if op == "contains_any":
            if val is None:
                return False
            return any(v.upper() in str(val).upper() for v in test["values"])

        if op == "regex":
            return bool(re.search(test["pattern"], str(val or ""), re.I))

        if op == "not_regex":
            return not bool(re.search(test["pattern"], str(val or ""), re.I))

        if op == "eq":
            return str(val).lower() == str(test["value"]).lower()

        if op == "gt":
            return (val or 0) > test["value"]

        if op == "lt":
            return (val or 0) < test["value"]

        if op == "between":
            return test["min"] <= (val or 0) <= test["max"]

        if op == "not_between":
            # Handles wrap-around ranges like 25–5 (end of month / start of next)
            lo, hi = test["min"], test["max"]
            v = val or 0
            if lo <= hi:
                return not (lo <= v <= hi)
            return not (v >= lo or v <= hi)

        if op == "not_in":
            return str(val or "").lower() not in [x.lower() for x in test["values"]]

        if op == "similarity_gte":
            # Compare against prior transactions in same window
            desc = str(val or "")
            amount = abs(txn.debit or 0)
            for other in all_txns:
                if other is txn:
                    continue
                other_amount = abs(other.debit or 0)
                if abs(other_amount - amount) > 0.01:
                    continue
                ratio = SequenceMatcher(None, desc.upper(), str(other.description or "").upper()).ratio()
                if ratio >= test["threshold"]:
                    return True
            return False

        if op == "matches_prior_within_days":
            # Already handled by similarity check — just check date proximity
            from datetime import timedelta
            days = test.get("days", 5)
            amount = abs(txn.debit or 0)
            for other in all_txns:
                if other is txn:
                    continue
                if abs(abs(other.debit or 0) - amount) > 0.01:
                    continue
                if abs((txn.txn_date - other.txn_date).days) <= days:
                    return True
            return False

        if op == "gt_zscore":
            # Simplified: flag if amount > mean*3 of all debits
            import statistics
            all_debits = [abs(t.debit) for t in all_txns if t.debit]
            if len(all_debits) < 3:
                return False
            mean = statistics.mean(all_debits)
            stdev = statistics.stdev(all_debits)
            if stdev == 0:
                return False
            z = (abs(txn.debit or 0) - mean) / stdev
            return z > test.get("threshold", 2.5)

        if op == "is_round":
            divisor = test.get("divisor", 1000)
            return (abs(txn.debit or txn.credit or 0) % divisor) == 0

        return False

    def _get_field(self, txn, field: str):
        if field == "description": return txn.description
        if field == "direction":   return "debit" if (txn.debit or 0) > 0 else "credit"
        if field == "amount":      return abs(txn.debit or txn.credit or 0)
        if field == "category":    return txn.category
        if field == "day_of_month": return txn.txn_date.day
        return getattr(txn, field, None)
