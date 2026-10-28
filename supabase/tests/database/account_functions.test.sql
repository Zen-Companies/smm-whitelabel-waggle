-- T4 functions: service role only. Behaviour is covered by tests/integration/accounts.test.ts.
-- Run with `supabase test db` (pnpm test:db). Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local role authenticated;
select throws_ok(
  $$ select * from public.upsert_connected_account(gen_random_uuid(), 'acc', 'instagram', 'u') $$,
  '42501', null, 'authenticated cannot upsert accounts');
select throws_ok(
  $$ select * from public.transition_account_items(gen_random_uuid(), gen_random_uuid(), '{new}', 'paused', 'x') $$,
  '42501', null, 'authenticated cannot change item status');
reset role;

set local role anon;
select throws_ok(
  $$ select * from public.upsert_connected_account(gen_random_uuid(), 'acc', 'instagram', 'u') $$,
  '42501', null, 'anon cannot upsert accounts');
select throws_ok(
  $$ select * from public.transition_account_items(gen_random_uuid(), gen_random_uuid(), '{new}', 'paused', 'x') $$,
  '42501', null, 'anon cannot change item status');
reset role;

select * from finish();
rollback;
