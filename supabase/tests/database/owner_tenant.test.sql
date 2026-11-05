-- create_owner_tenant: the owner's first tenant, created once (T3); create_brand adds more (T47).
-- Run with `supabase test db` (pnpm test:db). Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

-- Brands (T47): the same owner can add more tenants, one per name.
create temp table brand_call as
  select * from public.create_brand('d0000000-0000-4000-8000-000000000001', '  Bloom Florist ');
select is((select created from brand_call), true, 'create_brand adds a second tenant');
select results_eq(
  $$ select name from public.tenants where id = (select tenant_id from brand_call) $$,
  array['Bloom Florist'::text], 'brand name is trimmed');
select results_eq(
  $$ select tenant_id, created from public.create_brand('d0000000-0000-4000-8000-000000000001', 'bloom florist') $$,
  $$ select tenant_id, false from brand_call $$, 'the same name again returns that brand');
select results_eq(
  $$ select count(*)::int from public.autonomy_settings where tenant_id = (select tenant_id from brand_call) $$,
  array[5], 'the new brand gets default autonomy settings');
select results_eq(
  $$ select tenant_id from public.create_owner_tenant('d0000000-0000-4000-8000-000000000001', 'x') $$,
  $$ select tenant_id from first_call $$, 'login still lands on the first brand');

set local role authenticated;
select throws_ok(
  $$ select * from public.create_owner_tenant('d0000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'authenticated users cannot call it');
select throws_ok(
  $$ select * from public.create_brand('d0000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'authenticated users cannot call create_brand');
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.create_owner_tenant('d0000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'anon cannot call it');
select throws_ok(
  $$ select * from public.create_brand('d0000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'anon cannot call create_brand');
reset role;

select * from finish();
rollback;
