-- Settings → Account: password detection, Disconnect Google only with a password, what blocks
-- deleting a login, and the clean-up before it. Server only. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, encrypted_password) values
  ('b7000000-0000-4000-8000-000000000001', 'pw@test.local', extensions.crypt('aaaaaaaaaa', extensions.gen_salt('bf'))),
  ('b7000000-0000-4000-8000-000000000002', 'google@test.local', ''),
  ('b7000000-0000-4000-8000-000000000003', 'teammate@test.local', '');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at) values
  (gen_random_uuid(), 'b7000000-0000-4000-8000-000000000001', 'g-1', 'google', '{"sub":"g-1","email":"pw@test.local"}', now(), now()),
  (gen_random_uuid(), 'b7000000-0000-4000-8000-000000000002', 'g-2', 'google', '{"sub":"g-2","email":"google@test.local"}', now(), now());

select ok(public.login_has_password('b7000000-0000-4000-8000-000000000001'), 'a password login has one');
select ok(not public.login_has_password('b7000000-0000-4000-8000-000000000002'), 'a Google-only login has none');
select ok(not public.disconnect_google('b7000000-0000-4000-8000-000000000002'), 'Google stays without a password');
select ok(public.disconnect_google('b7000000-0000-4000-8000-000000000001'), 'Google disconnects with a password');

-- The Google-only login owns a shared organization with a teammate in it.
create temp table ids (k text primary key, v uuid);
insert into ids values ('org', public.create_organization('b7000000-0000-4000-8000-000000000002', 'Shared Co'));
insert into public.organization_members (organization_id, user_id, role, all_brands)
  values ((select v from ids where k = 'org'), 'b7000000-0000-4000-8000-000000000003', 'member', true);
select results_eq($$ select organization_name from public.login_deletion_blockers('b7000000-0000-4000-8000-000000000002') $$,
  $$ values ('Shared Co'::text) $$, 'the only owner of an organization with others is blocked');
select ok(not public.prepare_login_deletion('b7000000-0000-4000-8000-000000000002'), 'and nothing is prepared');
select public.set_member_role((select v from ids where k = 'org'), 'b7000000-0000-4000-8000-000000000002',
  'b7000000-0000-4000-8000-000000000003', 'owner');
select is_empty($$ select 1 from public.login_deletion_blockers('b7000000-0000-4000-8000-000000000002') $$,
  'another owner unblocks it');

-- The password login has a personal organization with a brand.
insert into ids select 'brand', tenant_id from public.create_brand_in_org(
  public.create_personal_org('b7000000-0000-4000-8000-000000000001'), 'b7000000-0000-4000-8000-000000000001', 'My Shop');
select ok(public.prepare_login_deletion('b7000000-0000-4000-8000-000000000001'), 'nothing blocks a personal-only login');
select isnt((select offboarded_at from public.tenants where id = (select v from ids where k = 'brand')), null,
  'its brand is offboarded (3 months to restore)');
select is((select count(*)::int from public.organization_members where user_id = 'b7000000-0000-4000-8000-000000000001'), 0,
  'it left every organization');

set local role authenticated;
select throws_ok($$ select public.prepare_login_deletion('b7000000-0000-4000-8000-000000000001') $$, '42501', null,
  'server only');

select * from finish();
rollback;
