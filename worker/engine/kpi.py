"""
KPI calculator.
Inputs: enriched transactions + P&L lines.
Outputs: {runway_days, burn_rate, gross_margin, net_burn, cash_close, top_cost_buckets}
"""
import logging
from collections import defaultdict

log = logging.getLogger(__name__)


def calculate_kpis(transactions: list, pl_lines: list, currency: str = "GBP") -> dict:
    # ── Cash position ───────────────────────────────────────────────────────
    total_inflows  = sum(t.credit or 0 for t in transactions)
    total_outflows = sum(t.debit  or 0 for t in transactions)
    net_cash_flow  = total_inflows - total_outflows

    # Closing balance: use last transaction's balance if available, else compute
    cash_close = None
    balances = [t.balance for t in transactions if t.balance is not None]
    if balances:
        cash_close = balances[-1]
    else:
        cash_close = net_cash_flow  # approximation

    # ── Burn rate (avg monthly net outflow) ─────────────────────────────────
    # For a single month we just use this month's net outflow
    burn_rate = max(0, total_outflows - total_inflows)

    # ── Runway ──────────────────────────────────────────────────────────────
    runway_days = None
    if cash_close and cash_close > 0 and burn_rate > 0:
        runway_months = cash_close / burn_rate
        runway_days   = int(runway_months * 30)

    # ── Gross margin (from P&L) ──────────────────────────────────────────────
    revenue = sum(l["value"] for l in pl_lines if l.get("section") == "Revenue")
    cogs    = abs(sum(l["value"] for l in pl_lines if l.get("section") == "Cost of Sales"))
    gross_profit   = revenue - cogs
    gross_margin   = (gross_profit / revenue) if revenue else None

    # ── Net burn (P&L net loss if negative) ──────────────────────────────────
    ebitda_lines = [l for l in pl_lines if l.get("section") in ("EBITDA", "Net Profit")]
    net_profit   = ebitda_lines[-1]["value"] if ebitda_lines else None
    net_burn      = abs(net_profit) if net_profit and net_profit < 0 else 0

    # ── Top cost buckets ─────────────────────────────────────────────────────
    cat_totals: dict[str, float] = defaultdict(float)
    for t in transactions:
        if t.debit and t.category and t.category not in ("Revenue", "Unclassified"):
            cat_totals[t.category] += t.debit

    top_costs = sorted(
        [{"category": k, "amount": round(v, 2)} for k, v in cat_totals.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )[:5]

    return {
        "currency":         currency,
        "total_inflows":    round(total_inflows, 2),
        "total_outflows":   round(total_outflows, 2),
        "net_cash_flow":    round(net_cash_flow, 2),
        "cash_close":       round(cash_close, 2) if cash_close is not None else None,
        "burn_rate":        round(burn_rate, 2),
        "runway_days":      runway_days,
        "revenue":          round(revenue, 2),
        "gross_profit":     round(gross_profit, 2),
        "gross_margin":     round(gross_margin, 4) if gross_margin is not None else None,
        "net_profit":       round(net_profit, 2) if net_profit is not None else None,
        "net_burn":         round(net_burn, 2),
        "top_cost_buckets": top_costs,
    }
