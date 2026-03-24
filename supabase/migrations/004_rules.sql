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
