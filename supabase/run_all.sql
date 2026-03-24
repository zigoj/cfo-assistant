-- 001_orgs.sql
-- Organisations (one per business / accountant practice)

create extension if not exists "pgcrypto";

create table orgs (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  currency            char(3) not null default 'GBP',
  stripe_customer_id  text unique,
  tier                text not null default 'free'
                        check (tier in ('free','starter','pro','agency')),
  report_quota        int not null default 1,    -- max reports per billing period
  reports_used        int not null default 0,
  trial_ends_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger orgs_updated_at before update on orgs
  for each row execute procedure set_updated_at();

-- RLS
alter table orgs        enable row level security;
alter table org_members enable row level security;

create policy "members can read own org"
  on orgs for select
  using (id in (select org_id from org_members where user_id = auth.uid()));

create policy "owners can update org"
  on orgs for update
  using (id in (select org_id from org_members where user_id = auth.uid() and role = 'owner'));

create policy "members can read org_members"
  on org_members for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "owners can manage org_members"
  on org_members for all
  using (org_id in (select org_id from org_members where user_id = auth.uid() and role in ('owner','admin')));
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
-- 003_transactions.sql
-- Parsed & categorized bank transactions (child of report)

create table transactions (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references reports(id) on delete cascade,
  org_id        uuid not null references orgs(id) on delete cascade,

  -- Raw fields from bank statement
  txn_date      date not null,
  description   text not null,
  counterparty  text,
  reference     text,
  debit         numeric(14,2),
  credit        numeric(14,2),
  balance       numeric(14,2),
  currency      char(3) default 'GBP',

  -- Categorization
  category      text,            -- e.g. "Staff Costs"
  pl_line       text,            -- e.g. "5100 - Wages & Salaries"
  cf_type       text check (cf_type in ('operating_inflow','operating_outflow',
                                         'investing_inflow','investing_outflow',
                                         'financing_inflow','financing_outflow',
                                         'unclassified')),
  rule_id       text,            -- which rule matched
  confidence    numeric(4,3),    -- 0.000–1.000

  -- Anomaly flags
  flags         jsonb default '[]'::jsonb,
  -- e.g. [{"type":"POSSIBLE_DUPLICATE","severity":"high","message":"...","suggested_entry":"..."}]

  -- Manual override
  override_category  text,
  override_pl_line   text,
  reviewed_by        uuid references auth.users(id),
  reviewed_at        timestamptz,

  created_at    timestamptz not null default now()
);

create index on transactions(report_id);
create index on transactions(org_id, txn_date desc);
create index on transactions(report_id) where flags != '[]'::jsonb;

alter table transactions enable row level security;

create policy "org members can read transactions"
  on transactions for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "org members can update transactions"
  on transactions for update
  using (org_id in (select org_id from org_members where user_id = auth.uid()));
-- 004_rules.sql
-- Per-org categorization rule overrides (org inherits from global defaults)

create table categorization_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references orgs(id) on delete cascade,  -- null = global default
  rule_key    text not null,       -- matches "id" field in JSON rules file
  name        text not null,
  priority    int not null default 10,
  conditions  jsonb not null,
  action      jsonb not null,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(org_id, rule_key)
);

create trigger rules_updated_at before update on categorization_rules
  for each row execute procedure set_updated_at();

alter table categorization_rules enable row level security;

create policy "org members can read rules"
  on categorization_rules for select
  using (org_id is null or org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "org admins can manage rules"
  on categorization_rules for all
  using (org_id in (select org_id from org_members where user_id = auth.uid() and role in ('owner','admin')));
-- 005_storage_policies.sql
-- Storage bucket RLS policies for report-inputs and report-outputs.
-- Run AFTER creating the two buckets in the Supabase dashboard (or via seed.sql).

-- ── report-inputs ─────────────────────────────────────────────────────────────
-- Org members can upload files scoped to their org_id prefix.
-- Service role (worker) can read/write anything (bypasses RLS).

create policy "org members can upload inputs"
  on storage.objects for insert
  with check (
    bucket_id = 'report-inputs'
    and (storage.foldername(name))[1] in (
      select org_id::text from org_members where user_id = auth.uid()
    )
  );

create policy "org members can read own inputs"
  on storage.objects for select
  using (
    bucket_id = 'report-inputs'
    and (storage.foldername(name))[1] in (
      select org_id::text from org_members where user_id = auth.uid()
    )
  );

create policy "org members can delete own inputs"
  on storage.objects for delete
  using (
    bucket_id = 'report-inputs'
    and (storage.foldername(name))[1] in (
      select org_id::text from org_members where user_id = auth.uid()
    )
  );

-- Lite (B2C guest) uploads land under "lite/" prefix — no auth required
create policy "anon can upload lite inputs"
  on storage.objects for insert
  with check (
    bucket_id = 'report-inputs'
    and (storage.foldername(name))[1] = 'lite'
  );

-- ── report-outputs ────────────────────────────────────────────────────────────
-- Org members can read PDFs from their org prefix.
-- Worker (service role) uploads — bypasses RLS.

create policy "org members can read own outputs"
  on storage.objects for select
  using (
    bucket_id = 'report-outputs'
    and (storage.foldername(name))[1] in (
      select org_id::text from org_members where user_id = auth.uid()
    )
  );

-- Lite users can read outputs under their report prefix (accessed via signed URL)
-- No anon read policy needed — signed URLs bypass RLS automatically.
-- Run this once after all migrations to seed required data.

-- 1. Create the B2C "lite" org used by guest uploads (/lite page)
insert into orgs (id, name, tier, report_quota, currency)
values (
  '00000000-0000-0000-0000-000000000001',
  'CFO Assistant Lite',
  'free',
  9999,
  'GBP'
)
on conflict (id) do nothing;

-- 2. Create Supabase Storage buckets (run in SQL editor or Supabase dashboard → Storage)
-- Dashboard path: Storage → New bucket
--   bucket name: report-inputs   | public: false
--   bucket name: report-outputs  | public: false
