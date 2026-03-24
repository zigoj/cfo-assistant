"""
Local pipeline smoke test — no Supabase, no LLM calls needed.
Exercises CSV parsers, rules engine, anomaly detection, KPI calc.

Run:  python tests/test_pipeline_local.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"


# ── 1. CSV bank parser ───────────────────────────────────────────────────────

def parse_bank_csv(path: Path):
    """Minimal CSV reader that mimics the BankTransaction dataclass."""
    from dataclasses import dataclass, field
    from datetime import datetime
    from typing import Optional

    @dataclass
    class BankTxn:
        txn_date:    object
        description: str
        debit:       Optional[float]
        credit:      Optional[float]
        balance:     Optional[float]
        category:    Optional[str] = None
        flags:       list = field(default_factory=list)
        confidence:  float = 1.0

    import csv
    txns = []
    with open(path) as f:
        for row in csv.DictReader(f):
            d = row.get("Debit","").strip()
            c = row.get("Credit","").strip()
            b = row.get("Balance","").strip()
            desc = row.get("Description","").strip()
            date_str = row.get("Date","").strip()
            if not date_str or not desc:
                continue
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                continue
            txns.append(BankTxn(
                txn_date=dt,
                description=desc,
                debit=float(d) if d else None,
                credit=float(c) if c else None,
                balance=float(b) if b else None,
            ))
    return txns


def test_bank_csv():
    txns = parse_bank_csv(FIXTURES / "bank_sample.csv")
    assert len(txns) >= 15, f"Expected >=15 rows, got {len(txns)}"
    debits = [t for t in txns if t.debit]
    credits = [t for t in txns if t.credit]
    assert len(debits) >= 10
    assert len(credits) >= 2
    print(f"  ✓ bank CSV: {len(txns)} rows, {len(debits)} debits, {len(credits)} credits")


# ── 2. Rules engine ──────────────────────────────────────────────────────────

def test_rules_engine():
    txns = parse_bank_csv(FIXTURES / "bank_sample.csv")

    from engine.rules_engine import RulesEngine
    engine = RulesEngine(org_id="test-org", supabase=None)
    categorized = engine.categorize(txns)

    cats = {t.category for t in categorized if t.category}
    assert cats, "No categories assigned"
    payroll_txns = [t for t in categorized if t.category == "Staff Costs"]
    assert payroll_txns, f"Expected Staff Costs category, got categories: {cats}"
    print(f"  ✓ rules engine: {len(cats)} distinct categories: {sorted(cats)}")


# ── 3. Anomaly detection ─────────────────────────────────────────────────────

def test_anomaly_detection():
    txns = parse_bank_csv(FIXTURES / "bank_sample.csv")

    from engine.rules_engine import RulesEngine
    from engine.anomaly import detect_anomalies

    engine = RulesEngine(org_id="test-org", supabase=None)
    categorized = engine.categorize(txns)
    anomalies = detect_anomalies(categorized)

    print(f"  ✓ anomaly detection: {len(anomalies)} anomalies found")
    for a in anomalies:
        print(f"      [{a.severity}] {a.flag}: {a.description[:40]} — {a.message[:60]}")


# ── 4. P&L CSV parser ────────────────────────────────────────────────────────

def test_pl_csv():
    import csv

    rows = []
    with open(FIXTURES / "pl_sample.csv") as f:
        for row in csv.DictReader(f):
            actual = row.get("Jan 2024 Actual","").strip()
            budget = row.get("Jan 2024 Budget","").strip()
            account = row.get("Account","").strip()
            if actual and account:
                rows.append({
                    "account": account,
                    "category": row.get("Category","").strip(),
                    "actual": float(actual) if actual else 0,
                    "budget": float(budget) if budget else 0,
                })

    revenue = next((r for r in rows if r["account"] == "Revenue"), None)
    gross_profit = next((r for r in rows if r["account"] == "Gross Profit"), None)

    assert revenue and revenue["actual"] == 36250.0
    assert gross_profit and gross_profit["actual"] == 28150.0
    margin = gross_profit["actual"] / revenue["actual"]
    assert 0.77 < margin < 0.78, f"Unexpected margin {margin}"
    print(f"  ✓ P&L CSV: revenue={revenue['actual']:,.0f}, gross_margin={margin:.1%}")


# ── 5. KPI calculation ───────────────────────────────────────────────────────

def test_kpi():
    from engine.kpi import calculate_kpis

    txns = parse_bank_csv(FIXTURES / "bank_sample.csv")

    # Minimal P&L lines stub matching kpi.py expected format
    pl_lines = [
        {"section": "Revenue",       "value": 36250.0},
        {"section": "Cost of Sales", "value": 8100.0},
        {"section": "EBITDA",        "value": 4716.0},
    ]

    kpis = calculate_kpis(transactions=txns, pl_lines=pl_lines, currency="GBP")
    assert kpis["gross_margin"] is not None
    assert kpis["burn_rate"] is not None
    assert kpis["runway_days"] is not None
    print(f"  ✓ KPIs: runway={kpis['runway_days']}d, burn=£{kpis['burn_rate']:,.0f}/mo, margin={kpis['gross_margin']:.1%}")


# ── runner ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [test_bank_csv, test_rules_engine, test_anomaly_detection, test_pl_csv, test_kpi]
    passed = failed = 0
    for t in tests:
        name = t.__name__
        try:
            print(f"\n{name}")
            t()
            passed += 1
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
            import traceback; traceback.print_exc()
            failed += 1
    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    sys.exit(failed)
