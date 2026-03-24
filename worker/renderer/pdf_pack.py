"""
PDF renderer — builds a self-contained HTML management pack and converts it to PDF via weasyprint.
The HTML is fully inline (no external assets) so it works in a headless environment.
"""
import logging
from datetime import datetime

log = logging.getLogger(__name__)


def render_pdf_pack(
    report_json: dict,
    org_id: str,
    report_id: str,
    currency: str = "GBP",
) -> bytes:
    html = _build_html(report_json, currency)
    try:
        import weasyprint
        pdf = weasyprint.HTML(string=html).write_pdf()
        log.info(f"PDF rendered: {len(pdf)} bytes")
        return pdf
    except (ImportError, OSError) as e:
        log.warning(f"weasyprint unavailable ({e}) — returning HTML bytes instead")
        return html.encode("utf-8")


def _build_html(rj: dict, currency: str) -> str:
    sym = {"GBP": "£", "EUR": "€", "USD": "$"}.get(currency, currency)
    kpis = rj.get("kpis", {})
    generated = datetime.utcnow().strftime("%d %b %Y, %H:%M UTC")

    def fmt(v, decimals=0):
        if v is None:
            return "—"
        return f"{sym}{abs(v):,.{decimals}f}"

    def pct(v):
        return f"{v * 100:.1f}%" if v is not None else "—"

    # ── KPI cards HTML ────────────────────────────────────────────────────────
    runway = kpis.get("runway_days")
    runway_color = "#dc2626" if (runway is not None and runway < 60) else "#059669"
    gm = kpis.get("gross_margin")
    gm_color = "#dc2626" if (gm is not None and gm < 0.5) else "#059669"

    kpi_cards = f"""
<div class="kpi-grid">
  <div class="kpi-card" style="border-top:4px solid {runway_color};">
    <div class="kpi-label">Cash Runway</div>
    <div class="kpi-value" style="color:{runway_color};">{runway or "—"} <span class="kpi-unit">days</span></div>
  </div>
  <div class="kpi-card" style="border-top:4px solid #3b82f6;">
    <div class="kpi-label">Net Burn Rate</div>
    <div class="kpi-value" style="color:#3b82f6;">{fmt(kpis.get("burn_rate"))}<span class="kpi-unit">/mo</span></div>
  </div>
  <div class="kpi-card" style="border-top:4px solid {gm_color};">
    <div class="kpi-label">Gross Margin</div>
    <div class="kpi-value" style="color:{gm_color};">{pct(gm)}</div>
  </div>
  <div class="kpi-card" style="border-top:4px solid #0d9488;">
    <div class="kpi-label">Closing Cash</div>
    <div class="kpi-value" style="color:#0d9488;">{fmt(kpis.get("cash_close"))}</div>
  </div>
</div>"""

    # ── P&L table ─────────────────────────────────────────────────────────────
    pl_rows = ""
    for row in rj.get("pl_summary", []):
        indent  = "padding-left:24px;color:#475569;" if row.get("indent") else ""
        bold    = "font-weight:700;background:#f8fafc;" if row.get("is_total") else ""
        neg_col = "color:#dc2626;" if row.get("value", 0) < 0 else ""
        pl_rows += f"""<tr style="{bold}">
  <td style="padding:6px 12px;{indent}">{row['label']}</td>
  <td style="padding:6px 12px;text-align:right;{neg_col}">{fmt(row.get('value'), 2)}</td>
</tr>"""

    # ── Anomaly rows ──────────────────────────────────────────────────────────
    anom_rows = ""
    severity_colors = {"high": "#dc2626", "medium": "#d97706", "low": "#3b82f6"}
    for a in rj.get("anomalies", []):
        color = severity_colors.get(a.get("severity", "low"), "#94a3b8")
        anom_rows += f"""<tr>
  <td style="padding:6px 12px;"><span style="color:{color};font-weight:600;">{a.get('severity','').upper()}</span></td>
  <td style="padding:6px 12px;">{a.get('flag','').replace('_',' ')}</td>
  <td style="padding:6px 12px;">{a.get('description','')}</td>
  <td style="padding:6px 12px;text-align:right;">{fmt(a.get('amount'))}</td>
  <td style="padding:6px 12px;color:#64748b;font-size:0.85em;">{a.get('suggested_entry','')}</td>
</tr>"""

    # ── Cash flow summary ─────────────────────────────────────────────────────
    cf = rj.get("cf_summary", {})
    cf_rows = ""
    for label, key in [
        ("Operating receipts",  "operating_inflow"),
        ("Operating payments",  "operating_outflow"),
        ("Net operating",       "operating_net"),
        ("Investing receipts",  "investing_inflow"),
        ("Investing payments",  "investing_outflow"),
        ("Net investing",       "investing_net"),
        ("Financing receipts",  "financing_inflow"),
        ("Financing payments",  "financing_outflow"),
        ("Net financing",       "financing_net"),
    ]:
        val = cf.get(key, 0) or 0
        is_net = "net" in key
        style = "font-weight:700;" if is_net else ""
        neg = "color:#dc2626;" if val < 0 else ""
        cf_rows += f'<tr style="{style}"><td style="padding:5px 12px;">{label}</td><td style="padding:5px 12px;text-align:right;{neg}">{fmt(val, 2)}</td></tr>'

    # ── Top cost buckets ──────────────────────────────────────────────────────
    cost_bars = ""
    top_costs = kpis.get("top_cost_buckets", [])
    max_cost  = max((c["amount"] for c in top_costs), default=1) or 1
    for c in top_costs:
        pct_width = int(c["amount"] / max_cost * 100)
        cost_bars += f"""<div style="margin-bottom:8px;">
  <div style="display:flex;justify-content:space-between;font-size:0.85em;margin-bottom:2px;">
    <span>{c['category']}</span><span>{fmt(c['amount'])}</span>
  </div>
  <div style="background:#e2e8f0;border-radius:4px;height:8px;">
    <div style="background:#0d9488;width:{pct_width}%;height:8px;border-radius:4px;"></div>
  </div>
</div>"""

    # ── GL Bridge ─────────────────────────────────────────────────────────────
    gl_rows = ""
    for row in rj.get("gl_bridge", []):
        variance = row.get("variance")
        var_style = "color:#d97706;font-weight:600;" if (variance is not None and abs(variance) > 0.01) else "color:#94a3b8;"
        gl_rows += f"""<tr>
  <td style="padding:5px 12px;">{row.get('label','')}</td>
  <td style="padding:5px 12px;text-align:right;">{fmt(row.get('mgmt_value'))}</td>
  <td style="padding:5px 12px;text-align:right;">{"—" if row.get('tb_value') is None else fmt(row.get('tb_value'))}</td>
  <td style="padding:5px 12px;text-align:right;{var_style}">{"—" if variance is None else fmt(variance)}</td>
</tr>"""

    # ── Budget Variance ────────────────────────────────────────────────────────
    bv_rows = ""
    for row in rj.get("budget_variance", []):
        variance = row.get("variance", 0)
        unfav = variance < 0
        var_style = "color:#dc2626;font-weight:600;" if unfav else "color:#059669;font-weight:600;"
        pct_label = f"{'—' if row.get('variance_pct') is None else ('+' if not unfav else '') + str(row['variance_pct']) + '%'}"
        bv_rows += f"""<tr>
  <td style="padding:5px 12px;">{row.get('label','')}</td>
  <td style="padding:5px 12px;text-align:right;">{fmt(row.get('budget'))}</td>
  <td style="padding:5px 12px;text-align:right;">{fmt(row.get('actual'))}</td>
  <td style="padding:5px 12px;text-align:right;{var_style}">{('' if unfav else '+') + fmt(abs(variance))}</td>
  <td style="padding:5px 12px;text-align:right;font-size:0.85em;{var_style}">{pct_label}</td>
</tr>"""

    # ── Suggested journals ─────────────────────────────────────────────────────
    journal_rows = ""
    for j in rj.get("suggested_journals", []):
        journal_rows += f"""<tr>
  <td style="padding:5px 12px;font-size:0.8em;color:#94a3b8;font-family:monospace;">{j.get('anomaly_flag','').replace('_',' ')}</td>
  <td style="padding:5px 12px;">{j.get('dr_account','')}</td>
  <td style="padding:5px 12px;">{j.get('cr_account','')}</td>
  <td style="padding:5px 12px;text-align:right;">{fmt(j.get('amount'), 2)}</td>
  <td style="padding:5px 12px;font-size:0.85em;color:#64748b;">{j.get('narration','')}</td>
</tr>"""

    narrative = rj.get("narrative", "")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Management Pack — {generated}</title>
<style>
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:system-ui,-apple-system,sans-serif; color:#1e293b; background:#fff; font-size:14px; }}
  @media print {{
    body {{ background:#fff; }}
    .no-print {{ display:none; }}
    @page {{ margin:15mm; size:A4; }}
    .page-break {{ page-break-before:always; }}
  }}
  .container {{ max-width:900px; margin:0 auto; padding:32px 24px; }}
  h1 {{ font-size:1.6rem; font-weight:800; color:#0f172a; margin-bottom:4px; }}
  h2 {{ font-size:1.1rem; font-weight:700; color:#0f172a; margin:28px 0 12px; border-bottom:2px solid #e2e8f0; padding-bottom:6px; }}
  .meta {{ font-size:0.8rem; color:#94a3b8; margin-bottom:28px; }}
  .kpi-grid {{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:8px; }}
  .kpi-card {{ background:#f8fafc; border-radius:12px; padding:16px; }}
  .kpi-label {{ font-size:0.75rem; color:#64748b; text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }}
  .kpi-value {{ font-size:1.6rem; font-weight:800; }}
  .kpi-unit {{ font-size:0.85rem; font-weight:400; }}
  table {{ width:100%; border-collapse:collapse; }}
  thead th {{ background:#f1f5f9; padding:8px 12px; text-align:left; font-size:0.8rem; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }}
  tbody tr:nth-child(even) {{ background:#fafafa; }}
  .narrative {{ background:#f0fdfa; border:1px solid #99f6e4; border-radius:12px; padding:20px 24px; line-height:1.75; font-size:0.92rem; color:#134e4a; }}
  .print-bar {{ background:#0d9488; color:#fff; padding:12px 24px; text-align:center; margin-bottom:24px; border-radius:0 0 12px 12px; }}
  .print-btn {{ background:#fff; color:#0d9488; border:none; padding:8px 24px; border-radius:8px; font-weight:700; cursor:pointer; font-size:0.9rem; }}
  .disclaimer {{ font-size:0.7rem; color:#94a3b8; text-align:center; margin-top:40px; }}
</style>
</head>
<body>
<div class="no-print print-bar">
  <button class="print-btn" onclick="window.print()">Download / Print PDF</button>
</div>

<div class="container">
  <h1>Management Pack</h1>
  <p class="meta">Generated {generated} · {len(rj.get('anomalies',[]))} anomalies · {rj.get('transactions_count',0)} transactions</p>

  <h2>Key Performance Indicators</h2>
  {kpi_cards}

  <h2>Commentary</h2>
  <div class="narrative">{narrative or "Commentary will appear here once the AI agent has processed all inputs."}</div>

  <h2>P&L Summary</h2>
  <table>
    <thead><tr><th>Line Item</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>{pl_rows or "<tr><td colspan='2' style='padding:12px;color:#94a3b8;'>No P&L data available</td></tr>"}</tbody>
  </table>

  <div class="page-break"></div>

  <h2>Cash Flow Summary</h2>
  <table>
    <thead><tr><th>Item</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>{cf_rows}</tbody>
  </table>

  <h2>Top Cost Buckets</h2>
  <div style="max-width:480px;">{cost_bars or "<p style='color:#94a3b8;'>No cost data available</p>"}</div>

  {"<h2>Anomalies &amp; Flags</h2><table><thead><tr><th>Severity</th><th>Type</th><th>Description</th><th style='text-align:right;'>Amount</th><th>Suggestion</th></tr></thead><tbody>" + anom_rows + "</tbody></table>" if anom_rows else ""}

  {"<div class='page-break'></div><h2>Budget vs Actual</h2><table><thead><tr><th>Account</th><th style='text-align:right;'>Budget</th><th style='text-align:right;'>Actual</th><th style='text-align:right;'>Variance</th><th style='text-align:right;'>%</th></tr></thead><tbody>" + bv_rows + "</tbody></table>" if bv_rows else ""}

  {"<h2>GL Bridge</h2><table><thead><tr><th>Account</th><th style='text-align:right;'>Management</th><th style='text-align:right;'>Trial Balance</th><th style='text-align:right;'>Variance</th></tr></thead><tbody>" + gl_rows + "</tbody></table>" if gl_rows else ""}

  {"<h2>Suggested Journal Entries</h2><table><thead><tr><th>Flag</th><th>Dr</th><th>Cr</th><th style='text-align:right;'>Amount</th><th>Narration</th></tr></thead><tbody>" + journal_rows + "</tbody></table>" if journal_rows else ""}

  <p class="disclaimer">
    This report is generated automatically from the data supplied. Always verify against source documents before making financial decisions.
    Confidential — not for distribution.
  </p>
</div>
</body>
</html>"""
