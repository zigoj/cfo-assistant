"""
AI Agent — uses Claude Sonnet to generate:
  1. Management narrative (P&L + cash-flow commentary)
  2. Anomaly explanations
  3. Suggested corrective journal entries
"""
import logging
import anthropic

log = logging.getLogger(__name__)

_client = None

def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


async def generate_narrative(
    kpis: dict,
    pl_lines: list,
    anomalies: list,
    currency: str = "GBP",
) -> str:
    """
    Returns a ~250-word management commentary suitable for inclusion in the board pack.
    """
    symbol = {"GBP": "£", "EUR": "€", "USD": "$"}.get(currency, currency)

    pl_text = "\n".join(
        f"  {l['label']}: {symbol}{l['value']:,.0f}" for l in pl_lines
        if l.get("section") in ("Revenue", "Cost of Sales", "Gross Profit", "EBITDA", "Net Profit")
    ) or "  (P&L data not available)"

    anom_text = ""
    if anomalies:
        anom_text = "\nKey anomalies flagged:\n" + "\n".join(
            f"  - [{a.severity.upper()}] {a.flag}: {a.message} ({symbol}{a.amount:,.0f} on {a.txn_date})"
            for a in anomalies[:5]
        )

    kpi_text = (
        f"Cash close: {symbol}{kpis.get('cash_close', 0):,.0f} | "
        f"Burn rate: {symbol}{kpis.get('burn_rate', 0):,.0f}/mo | "
        f"Runway: {kpis.get('runway_days', '?')} days | "
        f"Gross margin: {(kpis.get('gross_margin') or 0) * 100:.1f}%"
    )

    prompt = f"""You are a senior CFO writing a concise management commentary for a board pack.
Write 3–4 short paragraphs (max 250 words total) covering:
1. Overall cash position and burn rate
2. P&L performance highlights (revenue, costs, margins)
3. Key risks or anomalies requiring attention
4. One sentence forward-looking comment

Tone: professional, plain English, no jargon. Use {currency} ({symbol}).

KPIs:
{kpi_text}

P&L summary:
{pl_text}
{anom_text}

Write only the commentary. No headings, no bullet points — flowing paragraphs."""

    response = _get_client().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    narrative = response.content[0].text.strip()
    log.info(f"Generated narrative ({len(narrative)} chars)")
    return narrative


async def suggest_journal_entries(anomalies: list, currency: str = "GBP") -> list[dict]:
    """
    For each high/medium anomaly, suggest a corrective double-entry journal.
    Returns list of {anomaly_flag, dr_account, cr_account, amount, narration}
    """
    if not anomalies:
        return []

    high_med = [a for a in anomalies if a.severity in ("high", "medium")][:5]
    if not high_med:
        return []

    rows = "\n".join(
        f"{i}. {a.flag} | {a.txn_date} | {a.description} | amount: {a.amount:.2f} | {a.message}"
        for i, a in enumerate(high_med)
    )

    prompt = f"""For each flagged accounting anomaly below, suggest a corrective journal entry.
Return a JSON array (same index order) with fields:
  dr_account, cr_account, amount, narration

Example: [{{"dr_account":"Suspense 9999","cr_account":"Sales 1000","amount":1250.00,"narration":"Reallocate unmatched receipt to sales"}}]

Anomalies:
{rows}

Return only the JSON array."""

    try:
        response = _get_client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        import json
        entries = json.loads(response.content[0].text)
        return [{"anomaly_flag": high_med[i].flag, **e} for i, e in enumerate(entries)]
    except Exception as ex:
        log.warning(f"Journal entry suggestion failed: {ex}")
        return []
