-- 002_reports.sql
-- Monthly management pack reports

create table reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  created_by    uuid references auth.users(id),
  report_month  date not null,                -- first day of month e.g. 2024-01-01
  status        text not null default 'pending'
                  check (status in ('pending','processing','ready','error')),
  progress_pct  int not null default 0,
  error_msg     text,

  -- Input file paths in Supabase Storage (org-scoped bucket)
  input_bank_pdf    text,    -- storage path
  input_pl_excel    text,
  input_tb_csv      text,
  input_budget_csv  text,    -- v2

  -- Output
  output_pdf_url    text,    -- signed URL set on completion
  report_json       jsonb,   -- full structured output cached here

  -- KPI snapshot (denormalized for dashboard speed)
  kpi_runway_days   int,
  kpi_burn_rate     numeric(14,2),
  kpi_gross_margin  numeric(6,4),   -- 0.0–1.0
  kpi_net_burn      numeric(14,2),
  kpi_cash_close    numeric(14,2),

  -- Stripe (for B2C one-off packs)
  stripe_session_id text unique,
  paid_at           timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on reports(org_id, report_month desc);
create index on reports(stripe_session_id) where stripe_session_id is not null;

create trigger reports_updated_at before update on reports
  for each row execute procedure set_updated_at();

alter table reports enable row level security;

create policy "org members can read reports"
  on reports for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "org members can insert reports"
  on reports for insert
  with check (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "org members can update own reports"
  on reports for update
  using (org_id in (select org_id from org_members where user_id = auth.uid()));
