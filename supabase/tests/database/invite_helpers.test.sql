-- T56: invites listed for the invited login, accepted by id with the email check, the Team list
-- with emails, and none of it reachable from the Data API. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-4000-8000-000000000001', 'owner-d@test.local', '{"full_name":"Dana Owner"}'),
  ('d0000000-0000-4000-8000-000000000002', 'joiner-d@test.local', '{}'),
  ('d0000000-0000-4000-8000-000000000003', 'other-d@test.local', '{}');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids values ('org', public.create_organization('d0000000-0000-4000-8000-000000000001', 'Dana Group'));
insert into ids select 'brand', tenant_id from public.create_brand_in_org((select v from ids where k = 'org'),
  'd0000000-0000-4000-8000-000000000001', 'Dana Shop');
insert into ids select 'inv', invite_id from public.invite_member((select v from ids where k = 'org'),
  'd0000000-0000-4000-8000-000000000001', 'joiner-d@test.local', 'viewer', false,
  array[(select v from ids where k = 'brand')], 'hash-d');

select ok(public.email_has_login('JOINER-D@test.local'), 'an address with a login is found, any case');
select ok(not public.email_has_login('nobody@test.local'), 'an address without one is not');
select results_eq(
  $$ select organization_name, role, brand_names from public.invites_for_user('d0000000-0000-4000-8000-000000000002') $$,
  $$ values ('Dana Group'::text, 'viewer'::text, array['Dana Shop']) $$,
  'the invited login sees its invite with the brand names');
select is_empty($$ select 1 from public.invites_for_user('d0000000-0000-4000-8000-000000000003') $$,
  'another login sees nothing');
select is((select status from public.accept_invite_by_id((select v from ids where k = 'inv'),
  'd0000000-0000-4000-8000-000000000003')), 'wrong_email', 'accepting by id still checks the email');
select is((select status from public.accept_invite_by_id((select v from ids where k = 'inv'),
  'd0000000-0000-4000-8000-000000000002')), 'joined', 'the invited login joins by id');
select results_eq(
  format($$ select email, role, tenant_ids from public.organization_team(%L) $$, (select v from ids where k = 'org')),
  format($$ values ('owner-d@test.local'::text, 'owner'::text, '{}'::uuid[]),
                   ('joiner-d@test.local'::text, 'viewer'::text, array[%L::uuid]) $$, (select v from ids where k = 'brand')),
  'the Team list has emails, roles and brand limits, owners first');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.organization_team(gen_random_uuid()) $$, '42501', null,
  'the Team list function is server only');

select * from finish();
rollback;
