-- T53 organizations: personal organization, access rebuilt from membership, "only these brands",
-- invites by email (expiry, email match, already a member), the last-owner rule, role limits for
-- admins, and RLS on the new tables. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'ana@test.local', '{"full_name": "Ana Reyes"}'),
  ('a0000000-0000-4000-8000-000000000002', 'marco@test.local', '{}'),
  ('a0000000-0000-4000-8000-000000000003', 'liza@test.local', '{"full_name": "Liza Tan"}'),
  ('a0000000-0000-4000-8000-000000000004', 'outsider@test.local', '{}');

-- Personal organization
select public.create_personal_org('a0000000-0000-4000-8000-000000000001');
select public.create_personal_org('a0000000-0000-4000-8000-000000000002');
select is(
  (select name from public.organizations where personal_of = 'a0000000-0000-4000-8000-000000000001'),
  'Ana''s Organization', 'personal organization is named after the login');
select is(public.create_personal_org('a0000000-0000-4000-8000-000000000001'),
  (select id from public.organizations where personal_of = 'a0000000-0000-4000-8000-000000000001'),
  'create_personal_org returns the same one on the second call');
select is(
  (select name from public.organizations where personal_of = 'a0000000-0000-4000-8000-000000000002'),
  'Marco''s Organization', 'no name: the email is used');

-- An organization with three brands
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids values ('org', public.create_organization('a0000000-0000-4000-8000-000000000001', 'Harbour Bean Group'));
insert into ids select 'pob', tenant_id from public.create_brand_in_org((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', 'Poblacion');
insert into ids select 'mak', tenant_id from public.create_brand_in_org((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', 'Makati');
insert into ids select 'bgc', tenant_id from public.create_brand_in_org((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', 'BGC');

select is((select created from public.create_brand_in_org((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', '  poblacion ')), false, 'same brand name returns the existing brand');
select is((select count(*)::int from public.tenant_members where user_id = 'a0000000-0000-4000-8000-000000000001'
           and role = 'owner' and tenant_id in (select v from ids where k in ('pob', 'mak', 'bgc'))),
  3, 'the owner gets every brand');
select throws_ok(
  format($$ select public.create_brand_in_org(%L, 'a0000000-0000-4000-8000-000000000004', 'Nope') $$,
         (select v from ids where k = 'org')),
  'P0001', 'not_allowed', 'outsiders can''t add brands');

-- Invite Marco as member, Poblacion only; Liza as viewer for all brands
select is((select status from public.invite_member((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', ' Marco@Test.local ', 'member', false,
  array[(select v from ids where k = 'pob')], 'hash-marco')), 'sent', 'invite sent');
select is((select status from public.invite_member((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', 'marco@test.local', 'member', false,
  array[(select v from ids where k = 'pob')], 'hash-marco-2')), 'refreshed', 're-inviting refreshes the open invite');
select is((select status from public.invite_by_token('hash-marco')), null, 'the old link stops working');
select throws_ok(
  format($$ select public.invite_member(%L, 'a0000000-0000-4000-8000-000000000001', 'x@test.local',
    'member', false, array[%L::uuid], 'hash-x') $$,
    (select v from ids where k = 'org'),
    (select id from public.organizations where personal_of = 'a0000000-0000-4000-8000-000000000002')),
  'P0001', 'bad_brands', 'only brands of this organization can be picked');
select throws_ok(
  format($$ select public.invite_member(%L, 'a0000000-0000-4000-8000-000000000001', 'x@test.local',
    'owner', true, null, 'hash-x') $$, (select v from ids where k = 'org')),
  'P0001', 'bad_role', 'invites can''t make owners');

select is((select status from public.accept_invite('hash-marco-2', 'a0000000-0000-4000-8000-000000000003')),
  'wrong_email', 'an invite only works for its email');
select is((select status from public.accept_invite('hash-marco-2', 'a0000000-0000-4000-8000-000000000002')),
  'joined', 'Marco joins');
select results_eq(
  format($$ select tenant_id, role from public.tenant_members where user_id = 'a0000000-0000-4000-8000-000000000002'
            and tenant_id in (%L, %L, %L) $$,
         (select v from ids where k = 'pob'), (select v from ids where k = 'mak'), (select v from ids where k = 'bgc')),
  format($$ values (%L::uuid, 'member'::text) $$, (select v from ids where k = 'pob')),
  'only these brands: Marco sees Poblacion only');
select is((select status from public.accept_invite('hash-marco-2', 'a0000000-0000-4000-8000-000000000002')),
  'already_member', 'opening the link again says already in');

select is((select status from public.invite_member((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', 'marco@test.local', 'viewer', true, null, 'hash-m3')),
  'already_member', 'inviting a member again changes nothing');

select is((select status from public.invite_member((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', 'liza@test.local', 'viewer', true, null, 'hash-liza')), 'sent', 'Liza invited');
update public.organization_invites set expires_at = now() - interval '1 minute' where token_hash = 'hash-liza';
select is((select status from public.accept_invite('hash-liza', 'a0000000-0000-4000-8000-000000000003')),
  'expired', 'an expired invite can''t be accepted');
select ok(public.resend_invite((select id from public.organization_invites where token_hash = 'hash-liza'),
  'a0000000-0000-4000-8000-000000000001', 'hash-liza-2'), 'resend gives a new link');
select is((select status from public.accept_invite('hash-liza-2', 'a0000000-0000-4000-8000-000000000003')),
  'joined', 'Liza joins with the new link');

-- A brand added later reaches "all brands" members, not limited ones
insert into ids select 'new', tenant_id from public.create_brand_in_org((select v from ids where k = 'org'),
  'a0000000-0000-4000-8000-000000000001', 'Ortigas');
select ok(exists (select 1 from public.tenant_members where user_id = 'a0000000-0000-4000-8000-000000000003'
  and tenant_id = (select v from ids where k = 'new')), 'all brands includes brands added later');
select ok(not exists (select 1 from public.tenant_members where user_id = 'a0000000-0000-4000-8000-000000000002'
  and tenant_id = (select v from ids where k = 'new')), 'a limited member doesn''t get new brands');

-- Roles
select public.set_member_role((select v from ids where k = 'org'), 'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000003', 'admin');
select throws_ok(
  format($$ select public.set_member_role(%L, 'a0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001', 'member') $$, (select v from ids where k = 'org')),
  'P0001', 'not_allowed', 'admins can''t change an owner');
select throws_ok(
  format($$ select public.set_member_role(%L, 'a0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000002', 'owner') $$, (select v from ids where k = 'org')),
  'P0001', 'not_allowed', 'admins can''t make owners');
select throws_ok(
  format($$ select public.leave_organization(%L, 'a0000000-0000-4000-8000-000000000001') $$,
    (select v from ids where k = 'org')),
  'P0001', 'last_owner', 'the only owner can''t leave');
select throws_ok(
  format($$ select public.set_member_role(%L, 'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001', 'admin') $$, (select v from ids where k = 'org')),
  'P0001', 'not_allowed', 'nobody changes their own role');
select public.set_member_brands((select v from ids where k = 'org'), 'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000002', false,
  array[(select v from ids where k = 'mak'), (select v from ids where k = 'bgc')]);
select is((select count(*)::int from public.tenant_members where user_id = 'a0000000-0000-4000-8000-000000000002'
  and tenant_id in (select v from ids where k in ('pob', 'mak', 'bgc'))), 2, 'brands changed: Makati and BGC');

-- RLS as Marco (member, Makati + BGC)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.tenants where id in (select v from ids where k in ('pob', 'mak', 'bgc', 'new'))),
  2, 'Marco reads only his two brands');
select ok(exists (select 1 from public.organizations where id = (select v from ids where k = 'org')),
  'Marco reads the organization');
select is((select count(*)::int from public.organization_invites), 0, 'members don''t read invites');
select throws_ok($$ select public.invite_member(null, null, 'a@b.c', 'member', true, null, 'h') $$,
  '42501', null, 'functions are server only');
select throws_ok($$ insert into public.organization_members (organization_id, user_id, role)
  values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000002', 'owner') $$,
  '42501', null, 'no direct writes to membership');
reset role;

-- Closing offboards every brand
select is(public.close_organization((select v from ids where k = 'org'), 'a0000000-0000-4000-8000-000000000001'),
  4, 'closing offboards the open brands');

select throws_ok(
  $$ select public.close_organization(
       (select id from public.organizations where personal_of = 'a0000000-0000-4000-8000-000000000001'),
       'a0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'personal', 'a personal organization can''t be closed');

select * from finish();
rollback;
