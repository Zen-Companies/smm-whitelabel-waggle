-- Setup first, then free (approved 20 Nov, canvas "Setup first, then free"). Additive.
--
-- A brand whose setup hasn't been "passed" sends its owner from every app page to /setup. Passed
-- once, for good: the owner finished setup, pressed Skip for now or Finish later once, or the
-- brand got a connected account. Written with the service role only (no grant to owners), and
-- audited (setup_passed) by the app.

alter table public.tenants
  add column setup_passed_at timestamptz,
  add column setup_passed_how text
    check (setup_passed_how in ('finished', 'skipped', 'finish_later', 'connected', 'backfill')),
  add column setup_passed_by uuid references auth.users (id) on delete set null;

-- Existing brands on release: anyone already using Waggle (a social account, any answer, a test
-- brand, or setup's last step chosen) is never pushed into setup.
with passed as (
  update public.tenants t
    set setup_passed_at = now(), setup_passed_how = 'backfill'
    where t.setup_passed_at is null
      and (
        t.is_test
        or exists (select 1 from public.social_accounts s where s.tenant_id = t.id)
        or exists (select 1 from public.kb_entries k where k.tenant_id = t.id)
        or exists (
          select 1 from public.audit_log a
          where a.tenant_id = t.id and a.action = 'setup_replies_chosen'
        )
      )
    returning t.id
)
insert into public.audit_log (tenant_id, action, actor, details)
  select id, 'setup_passed', 'system', '{"how": "backfill"}'::jsonb from passed;
