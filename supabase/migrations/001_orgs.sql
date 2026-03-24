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
