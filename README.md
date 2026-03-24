# CFO-DASHBOARD

Cash-flow & month-end management pack generator for SMEs and accountancy practices.

**Live:** https://cfo-assistant-jet.vercel.app

---

## What it does

Upload a bank statement (PDF), P&L (Excel/CSV), trial balance (CSV), and optional budget (CSV). Get back:

- Cash runway, burn rate, gross margin, closing cash — free snapshot
- Full management pack PDF: P&L summary, cash-flow statement, GL bridge, budget vs actual, anomaly flags, AI narrative
- Suggested journal entries for flagged transactions

---

## Stack

| Layer | Tech |
|---|---|
| Frontend + API routes | Next.js 16 (App Router) on Vercel |
| Database + Auth + Storage | Supabase (Postgres + RLS) |
| Payments | Stripe (subscriptions + one-off) |
| Analysis worker | Python FastAPI (Railway/Render) |
| AI narrative | Anthropic Claude |
| Email | Resend |

---

## Pricing

| Plan | Price |
|---|---|
| B2B Starter | £89/mo |
| B2B Pro | £249/mo |
| B2B Agency | £599/mo |
| B2C One-off pack | £19 |
| B2C Monthly | £9/mo |

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values
cp .env.example .env.local

# 3. Run migrations in Supabase SQL editor
# paste supabase/run_all.sql

# 4. Start Next.js
npm run dev

# 5. Start Python worker (separate terminal)
cd worker
pip install -r requirements.txt
uvicorn main:app --reload
```

---

## Worker deployment (Railway or Render)

```bash
cd worker
# Set env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#               ANTHROPIC_API_KEY, WORKER_SECRET, NEXT_PUBLIC_APP_URL
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## Running tests

```bash
cd worker
python3 tests/test_march2024_integration.py   # 10 tests — full pipeline
python3 tests/test_pipeline_local.py          # 5 tests — smoke test
```

---

## Sign-off checklist

- [ ] Worker `/health` → 200
- [ ] POST `/analyze` with dummy payload → `{jobId, status: "enqueued"}`
- [ ] Full upload → worker processes → report status becomes `ready`
- [ ] PDF download link returns valid PDF
- [ ] Stripe checkout → webhook fires → org tier updates
- [ ] GDPR delete removes user + files + cancels subscription
- [ ] Anomaly flags appear in report viewer
- [ ] RLS: user from org A cannot read reports from org B

---

## Environment variables

See `.env.example` for the full list. Required before first run:

- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + 8 price IDs
- `ANTHROPIC_API_KEY`
- `WORKER_URL` + `WORKER_SECRET`
- `LITE_ORG_ID` (UUID of the B2C guest org — created by seed.sql)
