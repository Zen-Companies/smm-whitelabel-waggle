-- create_owner_tenant: one tenant per owner, even when called again (docs/tasks.md T3).
-- Run with `supabase test db` (pnpm test:db). Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'signup@test.local');

create temp table first_call as
  select * from public.create_owner_tenant('d0000000-0000-4000-8000-000000000001', 'Signup Cafe');
create temp table second_call as
  select * from public.create_owner_tenant('d0000000-0000-4000-8000-000000000001', 'Signup Cafe');

select is((select created from first_call), true, 'first call creates the tenant');
select is((select created from second_call), false, 'second call does not');
select is((select tenant_id from second_call), (select tenant_id from first_call), 'both return the same tenant');
select results_eq(
  $$ select count(*)::int from public.tenant_members where user_id = 'd0000000-0000-4000-8000-000000000001' $$,
  array[1], 'exactly one membership');
select results_eq(
  $$ select name, role from public.tenants t join public.tenant_members m on m.tenant_id = t.id
     where m.user_id = 'd0000000-0000-4000-8000-000000000001' $$,
  $$ values ('Signup Cafe'::text, 'owner'::text) $$, 'tenant named, user is owner');
select results_eq(
  $$ select count(*)::int from public.autonomy_settings where tenant_id = (select tenant_id from first_call) $$,
  array[5], 'default autonomy settings created');
select results_eq(
  $$ select action, actor from public.audit_log where tenant_id = (select tenant_id from first_call) $$,
  $$ values ('tenant_created'::text, 'd0000000-0000-4000-8000-000000000001'::text) $$,
  'one tenant_created audit row');

select throws_ok(
  $$ with other as (insert into public.tenants (name) values ('Other Cafe') returning id)
     insert into public.tenant_members (tenant_id, user_id, role)
     select id, 'd0000000-0000-4000-8000-000000000001', 'owner' from other $$,
  '23505', null, 'the same user cannot own a second tenant');

set local role authenticated;
select throws_ok(
  $$ select * from public.create_owner_tenant('d0000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'authenticated users cannot call it');
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.create_owner_tenant('d0000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'anon cannot call it');
reset role;

select * from finish();
rollback;
