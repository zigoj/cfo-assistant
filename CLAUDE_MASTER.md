# CLAUDE_MASTER.md — CFO Assistant

## Project-specific overrides to CLAUDE_GENERAL.md

```
PROJECT_NAME     = "CFO Assistant — Cash-Flow & Month-End Pack Generator"
INPUT_TYPE       = Files (PDF bank statement, P&L Excel/CSV, TB CSV)
FREE_OUTPUT      = Cash runway + burn rate + gross margin (B2C free tier)
PREMIUM_OUTPUT   = Full management pack PDF: P&L, cash-flow, KPIs, GL bridge, narrative
```

---

## Architecture delta from CLAUDE_GENERAL.md

| CLAUDE_GENERAL pattern      | This project                                              |
|-----------------------------|-----------------------------------------------------------|
| POST JSON → calculate       | multipart/form-data → Supabase Storage → enqueue worker   |
| Sync calculate (ms)         | Async pipeline (60–90s) — poll `/api/report-status`       |
| No auth for free tier       | Supabase Auth required from day 1 (multi-org B2B)         |
| Express server              | Next.js App Router API routes + Python FastAPI worker     |
| In-memory session store     | Supabase Postgres (reports table) as persistent store     |

---

## File map (what changes vs. what copies)

| File | Status |
|------|--------|
| `src/app/api/upload/route.ts`           | ★ CUSTOM |
| `src/app/api/report-status/route.ts`    | ★ CUSTOM |
| `src/app/api/report/[id]/route.ts`      | ★ CUSTOM |
| `src/app/api/create-checkout/route.ts`  | ADAPTED (same pattern) |
| `src/app/api/stripe-webhook/route.ts`   | ADAPTED (same pattern) |
| `worker/parsers/pdf_bank.py`            | ★ CUSTOM |
| `worker/parsers/pl_excel.py`            | ★ CUSTOM |
| `worker/parsers/trial_balance.py`       | ★ CUSTOM |
| `worker/engine/rules_engine.py`         | ★ CUSTOM |
| `worker/engine/anomaly.py`              | ★ CUSTOM |
| `worker/engine/kpi.py`                  | ★ CUSTOM |
| `worker/ai_agent/agent.py`              | ★ CUSTOM |
| `worker/renderer/pdf_pack.py`           | ★ CUSTOM |
| `worker/rules/default_rules.json`       | ★ CUSTOM |
| `supabase/migrations/`                  | ★ CUSTOM |
| `src/components/UploadForm.tsx`         | ★ CUSTOM |
| `src/components/ReportViewer.tsx`       | ★ CUSTOM (= calculator.html analogue) |
| `src/app/page.tsx`                      | ★ CUSTOM (landing page) |
| Auth pages (login/signup)              | STANDARD (copy from this project) |

---

## Stripe setup (do this before running)

```bash
# Create products in Stripe dashboard, then:
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Test checkout
curl -X POST http://localhost:3000/api/create-checkout \
  -H "Content-Type: application/json" \
  -d '{"planKey":"b2b_starter","orgId":"YOUR_ORG_ID","billing":"monthly"}'
```

Prices:
| Plan         | Monthly | Annual |
|-------------|---------|--------|
| B2B Starter | £89     | £890   |
| B2B Pro     | £249    | £2,490 |
| B2B Agency  | £599    | £5,990 |
| B2C Pack    | £19 (one-off) | — |
| B2C Sub     | £9/mo   | —      |

All B2B plans: `trial_period_days: 14` (no card required for first 7 days).

---

## Supabase Storage buckets (create manually)

| Bucket          | Public | Max size | Notes |
|-----------------|--------|----------|-------|
| `report-inputs` | false  | 20 MB    | Raw uploaded files; RLS on org_id prefix |
| `report-outputs`| false  | 10 MB    | Generated PDFs; signed URLs only |

---

## Worker deployment (Railway or Render)

```bash
cd worker
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload  # dev
```

Set env vars: see `worker/.env.example`

---

## Sign-off checklist (extend CLAUDE_GENERAL.md §15)

```
□ worker /health → 200
□ POST /analyze with dummy payload → { jobId, status: "enqueued" }
□ Full upload → worker processes → report status becomes "ready"
□ PDF download link works and returns valid PDF
□ Stripe checkout → 14-day trial → webhook fires → org tier updates
□ GDPR delete: DELETE /api/delete-account removes user + files + cancels sub
□ Anomaly flags appear in report viewer for test statement with duplicates
□ Supabase RLS: user from org A cannot read reports from org B
```

---

## Pilot user onboarding (Week 7–8)

1. Create org manually in Supabase (or via signup flow).
2. Grant `pro` tier for 60 days (update `orgs.tier` and `orgs.trial_ends_at`).
3. Send Typeform feedback link after first successful report.
4. Watch `reports` table for errors; monitor `transactions` with `flags != []`.
