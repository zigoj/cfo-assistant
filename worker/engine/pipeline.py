"""
Main orchestration pipeline.
Downloads files from Supabase Storage → parses → rules engine → AI agent → renders PDF → uploads.
"""
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


def get_supabase():
    from supabase import create_client as _supabase_create_client
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return _supabase_create_client(url, key)


async def run_pipeline(job: dict):
    report_id   = job["reportId"]
    org_id      = job["orgId"]
    currency    = job.get("currency", "GBP")
    sb          = get_supabase()

    def update_status(status: str, progress: int, error_msg: str = None):
        data = {"status": status, "progress_pct": progress}
        if error_msg:
            data["error_msg"] = error_msg
        sb.table("reports").update(data).eq("id", report_id).execute()

    try:
        from parsers.pdf_bank import parse_bank_pdf
        from parsers.pl_excel import parse_pl
        from parsers.trial_balance import parse_trial_balance
        from parsers.budget_csv import parse_budget
        from engine.rules_engine import RulesEngine
        from engine.anomaly import detect_anomalies
        from engine.kpi import calculate_kpis
        from ai_agent.agent import generate_narrative, suggest_journal_entries
        from renderer.pdf_pack import render_pdf_pack

        update_status("processing", 5)
        log.info(f"[{report_id}] Pipeline started")

        # ── 1. Download files ────────────────────────────────────────────────
        with tempfile.TemporaryDirectory() as tmpdir:
            paths = {}
            for field, storage_path in [
                ("bank_pdf",    job.get("inputBankPdf")),
                ("pl_excel",    job.get("inputPlExcel")),
                ("tb_csv",      job.get("inputTbCsv")),
                ("budget_csv",  job.get("inputBudgetCsv")),
            ]:
                if not storage_path:
                    continue
                local = Path(tmpdir) / Path(storage_path).name
                res = sb.storage.from_("report-inputs").download(storage_path)
                local.write_bytes(res)
                paths[field] = str(local)

            update_status("processing", 15)

            # ── 2. Parse inputs ──────────────────────────────────────────────
            transactions = []
            if "bank_pdf" in paths:
                transactions = parse_bank_pdf(paths["bank_pdf"])
                log.info(f"[{report_id}] Parsed {len(transactions)} transactions")

            pl_lines = []
            if "pl_excel" in paths:
                pl_lines = parse_pl(paths["pl_excel"])
                log.info(f"[{report_id}] Parsed {len(pl_lines)} P&L lines")

            tb_lines = []
            if "tb_csv" in paths:
                tb_lines = parse_trial_balance(paths["tb_csv"])

            budget_lines = []
            if "budget_csv" in paths:
                budget_lines = parse_budget(paths["budget_csv"])

            update_status("processing", 35)

            # ── 3. Rules engine + anomaly detection ──────────────────────────
            engine = RulesEngine(org_id=org_id, supabase=sb)
            enriched = engine.categorize(transactions)
            anomalies = detect_anomalies(enriched)
            log.info(f"[{report_id}] {len(anomalies)} anomalies flagged")

            update_status("processing", 55)

            # ── 4. KPI calculation ────────────────────────────────────────────
            kpis = calculate_kpis(enriched, pl_lines, currency=currency)

            # ── 5. GL bridge + budget variance ───────────────────────────────
            gl_bridge = build_gl_bridge(pl_lines, tb_lines) if tb_lines else []
            budget_variance = build_budget_variance(pl_lines, budget_lines) if budget_lines else []

            update_status("processing", 65)

            # ── 6. AI narrative ───────────────────────────────────────────────
            narrative = await generate_narrative(
                kpis=kpis,
                pl_lines=pl_lines,
                anomalies=anomalies,
                currency=currency,
            )

            update_status("processing", 78)

            # ── 6b. Suggested journal entries ─────────────────────────────────
            journals = await suggest_journal_entries(anomalies, currency=currency)

            update_status("processing", 82)

            # ── 7. Render PDF ─────────────────────────────────────────────────
            report_json = {
                "kpis":        kpis,
                "pl_summary":  build_pl_summary(pl_lines),
                "cf_summary":  build_cf_summary(enriched),
                "gl_bridge":       gl_bridge,
                "budget_variance": budget_variance,
                "anomalies":   [a.__dict__ for a in anomalies],
                "narrative":   narrative,
                "suggested_journals": journals,
                "transactions_count": len(enriched),
            }

            pdf_bytes = render_pdf_pack(
                report_json=report_json,
                org_id=org_id,
                report_id=report_id,
                currency=currency,
            )

            # ── 8. Upload PDF ─────────────────────────────────────────────────
            pdf_path = f"{org_id}/{report_id}/pack.pdf"
            sb.storage.from_("report-outputs").upload(
                pdf_path, pdf_bytes,
                file_options={"content-type": "application/pdf", "upsert": "true"},
            )

            # Generate a long-lived signed URL (7 days) for the report row
            signed = sb.storage.from_("report-outputs").create_signed_url(pdf_path, 604800)
            pdf_url = signed.get("signedURL") or signed.get("signedUrl") or None

            update_status("processing", 95)

            # ── 9. Write results to DB ────────────────────────────────────────
            sb.table("reports").update({
                "status":           "ready",
                "progress_pct":     100,
                "report_json":      report_json,
                "output_pdf_url":   pdf_url,
                "kpi_runway_days":  kpis.get("runway_days"),
                "kpi_burn_rate":    kpis.get("burn_rate"),
                "kpi_gross_margin": kpis.get("gross_margin"),
                "kpi_cash_close":   kpis.get("cash_close"),
            }).eq("id", report_id).execute()

            # Write transactions to DB
            if enriched:
                rows = [t.to_db_row(report_id=report_id, org_id=org_id) for t in enriched]
                sb.table("transactions").insert(rows).execute()

            # ── 10. Send report-ready email ───────────────────────────────────
            _send_ready_email(sb, report_id, org_id, pdf_url)

            log.info(f"[{report_id}] Pipeline complete")

    except Exception as exc:
        log.exception(f"[{report_id}] Pipeline failed: {exc}")
        update_status("error", 0, str(exc))


def build_budget_variance(pl_lines: list, budget_lines: list) -> list:
    """Match P&L actuals against standalone budget lines by GL code then label."""
    budget_by_code  = {b["gl_code"]: b for b in budget_lines if b.get("gl_code")}
    budget_by_label = {b["label"].lower(): b for b in budget_lines}

    rows = []
    for line in pl_lines:
        bud = budget_by_code.get(line.get("gl_code") or "") or \
              budget_by_label.get(line.get("label", "").lower())
        if bud is None:
            continue
        actual   = line.get("value", 0)
        budgeted = bud["budget"]
        variance = actual - budgeted
        pct      = (variance / budgeted * 100) if budgeted else None
        rows.append({
            "label":    line["label"],
            "gl_code":  line.get("gl_code"),
            "actual":   actual,
            "budget":   budgeted,
            "variance": variance,
            "variance_pct": round(pct, 1) if pct is not None else None,
            "section":  line.get("section"),
        })
    return rows


def build_gl_bridge(pl_lines: list, tb_lines: list) -> list:
    """Reconcile management P&L lines against TB codes.

    TB balances are dr-cr, so revenue accounts (4xxx) are negative credits.
    Normalise to match management P&L sign convention (all positives) before
    computing variance.
    """
    tb_by_code = {t["code"]: t for t in tb_lines}
    bridge = []
    for line in pl_lines:
        gl_code = line.get("gl_code", "") or ""
        tb = tb_by_code.get(gl_code)
        if tb is not None:
            # Revenue accounts have credit balances (negative dr-cr); flip to positive
            tb_normalised = -tb["balance"] if gl_code.startswith("4") else tb["balance"]
        else:
            tb_normalised = None
        mgmt = line.get("value", 0)
        bridge.append({
            "label":      line.get("label"),
            "mgmt_value": mgmt,
            "tb_value":   tb_normalised,
            "variance":   (mgmt - tb_normalised) if tb_normalised is not None else None,
            "gl_code":    gl_code or None,
        })
    return bridge


def build_pl_summary(pl_lines: list) -> list:
    """Return ordered P&L rows for display."""
    SECTIONS = ["Revenue", "Cost of Sales", "Gross Profit", "Operating Expenses", "EBITDA", "Net Profit"]
    summary = []
    for section in SECTIONS:
        lines = [l for l in pl_lines if l.get("section") == section]
        for l in lines:
            summary.append({"label": l["label"], "value": l.get("value", 0), "indent": True, "is_total": False, "section": section})
        if lines:
            total = sum(l.get("value", 0) for l in lines)
            summary.append({"label": section, "value": total, "indent": False, "is_total": True, "section": section})
    return summary


def build_cf_summary(transactions: list) -> dict:
    """Aggregate transactions into direct-method cash-flow statement."""
    groups = {"operating_inflow": 0, "operating_outflow": 0,
               "investing_inflow": 0, "investing_outflow": 0,
               "financing_inflow": 0, "financing_outflow": 0}
    for t in transactions:
        cf_type = getattr(t, "cf_type", "unclassified")
        if cf_type in groups:
            amount = getattr(t, "credit", 0) or 0 if "inflow" in cf_type else abs(getattr(t, "debit", 0) or 0)
            groups[cf_type] += amount
    return {
        "operating_net": groups["operating_inflow"] - groups["operating_outflow"],
        "investing_net": groups["investing_inflow"] - groups["investing_outflow"],
        "financing_net": groups["financing_inflow"] - groups["financing_outflow"],
        **groups,
    }


def _send_ready_email(sb, report_id: str, org_id: str, pdf_url: Optional[str]) -> None:
    """Fire a report-ready email to all org members via the Next.js /api/send-report-email route."""
    resend_key = os.environ.get("RESEND_API_KEY")
    resend_domain = os.environ.get("RESEND_DOMAIN")
    app_url = os.environ.get("NEXT_PUBLIC_APP_URL", "")
    if not resend_key or not resend_domain:
        log.info("RESEND_API_KEY/DOMAIN not set — skipping report-ready email")
        return

    try:
        import resend as resend_sdk
        resend_sdk.api_key = resend_key

        # Get org name and report month
        org_row = sb.table("orgs").select("name").eq("id", org_id).single().execute()
        org_name = org_row.data.get("name", "Your organisation") if org_row.data else "Your organisation"

        rep_row = sb.table("reports").select("report_month, created_by").eq("id", report_id).single().execute()
        if not rep_row.data:
            return
        report_month_raw = rep_row.data.get("report_month", "")
        created_by = rep_row.data.get("created_by")
        try:
            from datetime import datetime
            month_label = datetime.strptime(report_month_raw[:7], "%Y-%m").strftime("%B %Y")
        except Exception:
            month_label = report_month_raw

        # Email the report creator only (they're always a member; avoid spamming whole team)
        if not created_by:
            return
        admin_sb = get_supabase()
        user_res = admin_sb.auth.admin.get_user_by_id(created_by)
        email_to = user_res.user.email if user_res.user else None
        if not email_to:
            return

        download_url = f"{app_url}/api/report/{report_id}?format=pdf"

        resend_sdk.Emails.send({
            "from": f"CFO Assistant <reports@{resend_domain}>",
            "to": email_to,
            "subject": f"Your {month_label} management pack is ready",
            "html": f"""
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1e293b;">
  <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:8px;">Your pack is ready</h1>
  <p style="color:#475569;margin-bottom:24px;">
    Hi {org_name}, your <strong>{month_label}</strong> management pack has been generated.
  </p>
  <a href="{download_url}"
     style="display:inline-block;background:#0f766e;color:#fff;font-weight:600;
            padding:12px 28px;border-radius:8px;text-decoration:none;">
    View &amp; Download Pack
  </a>
  <p style="font-size:0.75rem;color:#94a3b8;margin-top:32px;">
    Confidential — not for distribution.
  </p>
</div>""",
        })
        log.info(f"[{report_id}] Report-ready email sent to {email_to}")
    except Exception as exc:
        log.warning(f"[{report_id}] Failed to send report-ready email: {exc}")
