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
