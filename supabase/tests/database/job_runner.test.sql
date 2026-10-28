-- T6: job runner functions and the cron schedule. Run with `supabase test db`. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select results_eq(
  $$ select schedule, command from cron.job where jobname = 'process-inbound-items' $$,
  $$ values ('* * * * *'::text, 'select private.trigger_job_processing()'::text) $$,
  'pg_cron calls the job route every minute');

-- Fixtures.
insert into public.tenants (id, name) values ('e1000000-0000-4000-8000-000000000001', 'Jobs Cafe');
insert into public.social_accounts (id, tenant_id, zernio_account_id, platform) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'acc_jobs', 'instagram');
insert into public.inbound_items (id, tenant_id, social_account_id, kind, zernio_comment_id, text, received_at, status, next_run_at, locked_at) values
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'comment', 'jc1', 'a', now() - interval '3 min', 'new', null, null),
  ('e4000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'comment', 'jc2', 'b', now() - interval '2 min', 'new', now() + interval '1 hour', null),
  ('e4000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'comment', 'jc3', 'c', now() - interval '1 min', 'new', null, now()),
  ('e4000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'comment', 'jc4', 'd', now(), 'awaiting_approval', null, null),
  ('e4000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'comment', 'jc5', 'e', now() - interval '4 min', 'classified', null, now() - interval '6 min');

-- Only the tenant fixtures above are due here, but other rows may exist: filter by tenant.
create temp table claimed as select * from public.claim_items(100);
select results_eq(
  $$ select id::text from claimed where tenant_id = 'e1000000-0000-4000-8000-000000000001' order by id $$,
  $$ values ('e4000000-0000-4000-8000-000000000001'), ('e4000000-0000-4000-8000-000000000005') $$,
  'claims due items and stale locks; skips future, freshly locked and non-processing items');
select is((select account_status from claimed where id = 'e4000000-0000-4000-8000-000000000001'), 'active',
  'returns the account status');
select isnt((select locked_at from public.inbound_items where id = 'e4000000-0000-4000-8000-000000000001'), null,
  'claimed items are locked');
select is((select count(*)::int from public.claim_items(100) where tenant_id = 'e1000000-0000-4000-8000-000000000001'), 0,
  'a second claim right away gets nothing (locked)');

select ok(public.transition_item('e4000000-0000-4000-8000-000000000001', 'new', 'classified', 'classified', '{"category":"faq"}'),
  'transition from the current status succeeds');
select ok(not public.transition_item('e4000000-0000-4000-8000-000000000001', 'new', 'classified', 'classified'),
  'transition from a stale status is a no-op');
select results_eq(
  $$ select status, locked_at is null from public.inbound_items where id = 'e4000000-0000-4000-8000-000000000001' $$,
  $$ values ('classified'::text, true) $$, 'status moved and lock released');

set local role authenticated;
select throws_ok($$ select * from public.claim_items(1) $$, '42501', null, 'authenticated cannot claim items');
reset role;

select * from finish();
rollback;
