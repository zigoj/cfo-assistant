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
