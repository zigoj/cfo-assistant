"""
March 2024 full-pipeline integration test.
Uses realistic synthetic fixtures — no Supabase, no LLM.
Covers: bank CSV parse → rules → anomalies → P&L parse → TB parse →
        budget parse → KPI calc → GL bridge → budget variance → PDF render.

Run:  python tests/test_march2024_integration.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
import csv, datetime

FIXTURES = Path(__file__).parent / "fixtures"
BANK_CSV = FIXTURES / "bank_statement_march2024.csv"
PL_CSV   = FIXTURES / "pl_march2024.csv"
TB_CSV   = FIXTURES / "trial_balance_march2024.csv"
BUD_CSV  = FIXTURES / "budget_march2024.csv"


# ── Minimal BankTransaction matching the real dataclass interface ────────────

@dataclass
class BankTxn:
    txn_date:    object
    description: str
    debit:       Optional[float]
    credit:      Optional[float]
    balance:     Optional[float]
    category:    Optional[str] = None
    cf_type:     Optional[str] = None
    flags:       list = field(default_factory=list)
    confidence:  float = 1.0

    def to_db_row(self, report_id, org_id):
        return {"report_id": report_id, "org_id": org_id,
                "description": self.description, "category": self.category}


def load_bank(path=BANK_CSV):
    txns = []
    with open(path) as f:
        for row in csv.DictReader(f):
            d = row.get("Debit","").strip()
            c = row.get("Credit","").strip()
            b = row.get("Balance","").strip()
            desc = row.get("Description","").strip()
            date_str = row.get("Date","").strip()
            if not date_str or not desc: continue
            for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
                try:
                    dt = datetime.datetime.strptime(date_str, fmt); break
                except ValueError: continue
            else: continue
            txns.append(BankTxn(
                txn_date=dt, description=desc,
                debit=float(d) if d else None,
                credit=float(c) if c else None,
                balance=float(b) if b else None,
            ))
    return txns


# ── Test 1: Bank CSV parse ────────────────────────────────────────────────────

def test_bank_parse():
    txns = load_bank()
    debits  = [t for t in txns if t.debit]
    credits = [t for t in txns if t.credit]
    total_revenue = sum(t.credit for t in credits)
    total_spend   = sum(t.debit  for t in debits)

    assert len(txns) >= 30,        f"Expected ≥30 txns, got {len(txns)}"
    assert len(debits) >= 18,      f"Expected ≥18 debits, got {len(debits)}"
    assert len(credits) >= 10,     f"Expected ≥10 credits, got {len(credits)}"
    assert total_revenue > 100000, f"Revenue too low: {total_revenue}"
    assert total_spend > 50000,    f"Spend too low: {total_spend}"
    print(f"  ✓ bank: {len(txns)} txns | revenue £{total_revenue:,.2f} | spend £{total_spend:,.2f}")


# ── Test 2: Rules engine categorisation ──────────────────────────────────────

def test_categorisation():
    from engine.rules_engine import RulesEngine
    txns = load_bank()
    engine = RulesEngine(org_id="test-org", supabase=None)
    result = engine.categorize(txns)

    cats = {t.category for t in result if t.category}
    assert "Staff Costs"     in cats, f"Missing Staff Costs in {cats}"
    assert "Revenue"         in cats, f"Missing Revenue in {cats}"
    assert "Property Costs"  in cats, f"Missing Property Costs in {cats}"

    staff_total = sum(t.debit or 0 for t in result if t.category == "Staff Costs")
    assert staff_total > 40000, f"Payroll too low: {staff_total}"
    print(f"  ✓ categorisation: {len(cats)} categories | payroll £{staff_total:,.2f}")
    return result


# ── Test 3: Anomaly detection ─────────────────────────────────────────────────

def test_anomalies():
    from engine.rules_engine import RulesEngine
    from engine.anomaly import detect_anomalies
    txns = load_bank()
    engine = RulesEngine(org_id="test-org", supabase=None)
    enriched = engine.categorize(txns)
    anomalies = detect_anomalies(enriched)

    # Directors loan repayment should be flagged
    flags = {a.flag for a in anomalies}
    severities = {a.severity for a in anomalies}
    assert len(anomalies) >= 2, f"Expected ≥2 anomalies, got {len(anomalies)}"
    assert severities & {"high","medium","low"}, "No severity assigned"
    print(f"  ✓ anomalies: {len(anomalies)} flagged | types: {sorted(flags)[:4]}...")
    for a in anomalies:
        print(f"      [{a.severity:6}] {a.flag}: {a.description[:50]}")
    return enriched, anomalies


# ── Test 4: P&L parser ────────────────────────────────────────────────────────

def test_pl_parse():
    from parsers.pl_excel import parse_pl
    lines = parse_pl(str(PL_CSV))

    revenue_lines = [l for l in lines if l.get("section") == "Revenue"]
    opex_lines    = [l for l in lines if l.get("section") == "Operating Expenses"]
    cogs_lines    = [l for l in lines if l.get("section") == "Cost of Sales"]

    total_rev  = sum(l["value"] for l in revenue_lines)
    total_opex = sum(l["value"] for l in opex_lines)

    assert total_rev > 100000,  f"Revenue {total_rev} too low"
    assert len(opex_lines) >= 8, f"Expected ≥8 opex lines, got {len(opex_lines)}"

    # Budget column should be parsed too
    with_budget = [l for l in lines if l.get("budget") is not None]
    assert len(with_budget) >= 5, f"Expected budget data on ≥5 lines, got {len(with_budget)}"

    print(f"  ✓ P&L: {len(lines)} lines | revenue £{total_rev:,.2f} | opex lines {len(opex_lines)}")
    return lines


# ── Test 5: Trial balance parser ─────────────────────────────────────────────

def test_tb_parse():
    from parsers.trial_balance import parse_trial_balance
    tb = parse_trial_balance(str(TB_CSV))

    assert len(tb) >= 20, f"Expected ≥20 TB entries, got {len(tb)}"
    codes = {r.get("code") for r in tb if r.get("code")}
    assert "1200" in codes, "Missing cash account 1200"
    assert "4000" in codes, "Missing revenue account 4000"

    cash_row = next((r for r in tb if r.get("code") == "1200"), None)
    assert cash_row and abs(cash_row["balance"] - 94265.56) < 1, \
        f"Cash balance mismatch: {cash_row}"

    print(f"  ✓ TB: {len(tb)} accounts | cash £{cash_row['balance']:,.2f}")
    return tb


# ── Test 6: Budget CSV parser ─────────────────────────────────────────────────

def test_budget_parse():
    from parsers.budget_csv import parse_budget
    budget = parse_budget(str(BUD_CSV))

    assert len(budget) >= 15, f"Expected ≥15 budget lines, got {len(budget)}"
    total_budgeted_revenue = sum(b["budget"] for b in budget if b.get("gl_code","").startswith("4"))
    assert total_budgeted_revenue > 90000, f"Budget revenue {total_budgeted_revenue} too low"

    print(f"  ✓ budget: {len(budget)} lines | budgeted revenue £{total_budgeted_revenue:,.2f}")
    return budget


# ── Test 7: KPI calculation ───────────────────────────────────────────────────

def test_kpis():
    from engine.rules_engine import RulesEngine
    from engine.kpi import calculate_kpis
    from parsers.pl_excel import parse_pl

    txns = load_bank()
    engine = RulesEngine(org_id="test-org", supabase=None)
    enriched = engine.categorize(txns)
    pl_lines = parse_pl(str(PL_CSV))
    kpis = calculate_kpis(enriched, pl_lines, currency="GBP")

    assert kpis["gross_margin"] is not None
    assert kpis["cash_close"]  is not None
    assert kpis["burn_rate"]   is not None

    # Sanity bounds
    assert 0 < kpis["gross_margin"] < 1,          f"GM out of range: {kpis['gross_margin']}"
    assert kpis["cash_close"] > 0,                 f"Cash close non-positive: {kpis['cash_close']}"
    assert len(kpis.get("top_cost_buckets", [])) >= 2

    # Runway is None when profitable (burn_rate==0) — that's correct behaviour
    runway_label = f"{kpis['runway_days']}d" if kpis["runway_days"] else "∞ (profitable)"
    print(f"  ✓ KPIs: runway {runway_label} | burn £{kpis['burn_rate']:,.0f}/mo | "
          f"GM {kpis['gross_margin']:.1%} | cash £{kpis['cash_close']:,.2f}")
    return kpis, enriched, pl_lines


# ── Test 8: GL bridge ─────────────────────────────────────────────────────────

def test_gl_bridge():
    from parsers.pl_excel import parse_pl
    from parsers.trial_balance import parse_trial_balance
    from engine.pipeline import build_gl_bridge

    pl_lines = parse_pl(str(PL_CSV))
    tb_lines  = parse_trial_balance(str(TB_CSV))
    bridge    = build_gl_bridge(pl_lines, tb_lines)

    matched = [r for r in bridge if r["tb_value"] is not None]
    assert len(matched) >= 5, f"Expected ≥5 matched GL lines, got {len(matched)}"

    non_zero_var = [r for r in matched if r["variance"] and abs(r["variance"]) > 0.01]
    print(f"  ✓ GL bridge: {len(bridge)} lines | {len(matched)} matched | "
          f"{len(non_zero_var)} with variance")
    for r in non_zero_var[:3]:
        print(f"      {r['label']}: mgmt £{r['mgmt_value']:,.2f} vs TB £{r['tb_value']:,.2f} "
              f"(Δ £{r['variance']:,.2f})")


# ── Test 9: Budget variance ───────────────────────────────────────────────────

def test_budget_variance():
    from parsers.pl_excel import parse_pl
    from parsers.budget_csv import parse_budget
    from engine.pipeline import build_budget_variance

    pl_lines     = parse_pl(str(PL_CSV))
    budget_lines = parse_budget(str(BUD_CSV))
    variance     = build_budget_variance(pl_lines, budget_lines)

    assert len(variance) >= 10, f"Expected ≥10 variance lines, got {len(variance)}"

    favourable   = [r for r in variance if r["variance"] > 0]
    unfavourable = [r for r in variance if r["variance"] < 0]
    print(f"  ✓ budget variance: {len(variance)} lines | "
          f"{len(favourable)} fav | {len(unfavourable)} unfav")
    for r in sorted(variance, key=lambda x: abs(x["variance"]), reverse=True)[:4]:
        sign = "+" if r["variance"] >= 0 else ""
        print(f"      {r['label'][:30]:30} budget £{r['budget']:>10,.2f} | "
              f"actual £{r['actual']:>10,.2f} | {sign}£{r['variance']:,.2f} ({r['variance_pct']}%)")


# ── Test 10: PDF render ───────────────────────────────────────────────────────

def test_pdf_render():
    from engine.rules_engine import RulesEngine
    from engine.anomaly import detect_anomalies
    from engine.kpi import calculate_kpis
    from parsers.pl_excel import parse_pl
    from parsers.trial_balance import parse_trial_balance
    from parsers.budget_csv import parse_budget
    from engine.pipeline import build_gl_bridge, build_budget_variance, build_pl_summary, build_cf_summary
    from renderer.pdf_pack import render_pdf_pack

    txns    = load_bank()
    engine  = RulesEngine(org_id="test-org", supabase=None)
    enriched  = engine.categorize(txns)
    anomalies = detect_anomalies(enriched)
    pl_lines  = parse_pl(str(PL_CSV))
    tb_lines  = parse_trial_balance(str(TB_CSV))
    bud_lines = parse_budget(str(BUD_CSV))
    kpis      = calculate_kpis(enriched, pl_lines, currency="GBP")

    report_json = {
        "kpis":             kpis,
        "pl_summary":       build_pl_summary(pl_lines),
        "cf_summary":       build_cf_summary(enriched),
        "gl_bridge":        build_gl_bridge(pl_lines, tb_lines),
        "budget_variance":  build_budget_variance(pl_lines, bud_lines),
        "anomalies":        [a.__dict__ for a in anomalies],
        "suggested_journals": [],
        "narrative":        "March 2024 was a strong month with revenue exceeding budget by £9,500. "
                            "Gross margin held at 77.1% against a 77.7% target. Staff costs were in line. "
                            "Marketing underspent by £701 — review pipeline coverage for Q2.",
        "transactions_count": len(enriched),
    }

    output = render_pdf_pack(report_json=report_json, org_id="test-org",
                              report_id="march2024-test", currency="GBP")
    assert len(output) > 5000, f"Output too small: {len(output)} bytes"

    is_pdf  = output[:4] == b"%PDF"
    is_html = output[:15].lower().startswith(b"<!doctype")
    assert is_pdf or is_html, "Output is neither PDF nor HTML"
    kind = "PDF" if is_pdf else "HTML (weasyprint unavailable)"
    print(f"  ✓ render: {kind} | {len(output):,} bytes | "
          f"{len(report_json['pl_summary'])} P&L rows | "
          f"{len(report_json['anomalies'])} anomalies | "
          f"{len(report_json['budget_variance'])} budget lines | "
          f"{len(report_json['gl_bridge'])} GL lines")


# ── Runner ────────────────────────────────────────────────────────────────────

TESTS = [
    test_bank_parse,
    test_categorisation,
    test_anomalies,
    test_pl_parse,
    test_tb_parse,
    test_budget_parse,
    test_kpis,
    test_gl_bridge,
    test_budget_variance,
    test_pdf_render,
]

if __name__ == "__main__":
    passed = failed = 0
    for t in TESTS:
        print(f"\n{t.__name__.replace('test_','').replace('_',' ').title()}")
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
            import traceback; traceback.print_exc()
            failed += 1
    print(f"\n{'='*52}")
    print(f"Results: {passed} passed, {failed} failed")
    sys.exit(failed)
