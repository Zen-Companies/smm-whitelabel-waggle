-- T21 offboarding: owners lose an offboarded brand through RLS, can't offboard or restore one
-- themselves, and every table holding a brand's rows is either deleted by purge_tenant or kept on
-- purpose. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('f0000000-0000-4000-8000-000000000001', 'owner-f@test.local');
insert into public.tenants (id, name) values
  ('f1000000-0000-4000-8000-000000000001', 'Leaving F'),
  ('f1000000-0000-4000-8000-000000000002', 'Staying F');
insert into public.tenant_members (tenant_id, user_id) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001');

-- Every foreign key to tenants, minus the tables purge_tenant deletes and the ones it keeps.
-- A new tenant table fails this until it is added to purge_tenant (or kept here on purpose).
select is(
  (select array_agg(c.conrelid::regclass::text order by 1)
   from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'public.tenants'::regclass
     and c.conrelid::regclass::text not in (
       'drafts', 'alerts', 'notifications', 'leads', 'inbound_items', 'conversations',
       'post_metrics', 'posts', 'analytics_snapshots', 'kb_suggestions', 'kb_entries',
       'lab_runs', 'lab_cases', 'autonomy_settings', 'feature_flags', 'mcp_calls',
       'social_accounts', 'tenant_members',
       -- kept: costs and the audit trail
       'ai_usage', 'audit_log')),
  null,
  'every tenant table is deleted by purge_tenant or kept on purpose'
);

select isnt(
  public.offboard_tenant('f1000000-0000-4000-8000-000000000001', null),
  null,
  'offboard_tenant marks the brand'
);
select is(
  public.purge_tenant('f1000000-0000-4000-8000-000000000001'),
  false,
  'purge_tenant does nothing before the 3 months are over'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select id from public.tenants $$,
  $$ values ('f1000000-0000-4000-8000-000000000002'::uuid) $$,
  'the owner no longer sees the offboarded brand'
);
select throws_ok(
  $$ select public.restore_tenant('f1000000-0000-4000-8000-000000000001', null) $$,
  '42501', null, 'restore_tenant: server only'
);
select throws_ok(
  $$ select public.offboard_tenant('f1000000-0000-4000-8000-000000000002', null) $$,
  '42501', null, 'offboard_tenant: server only'
);
select throws_ok(
  $$ update public.tenants set offboarded_at = null where id = 'f1000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'an owner cannot change offboarding columns'
);

select * from finish();
rollback;
