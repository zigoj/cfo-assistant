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
