-- Beta access: codes (ok, used up, expired, off, wrong, too many tries), joining a team by
-- invite counts, and none of it is reachable from the Data API. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('be000000-0000-4000-8000-000000000001', 'one@test.local'),
  ('be000000-0000-4000-8000-000000000002', 'two@test.local'),
  ('be000000-0000-4000-8000-000000000003', 'three@test.local'),
  ('be000000-0000-4000-8000-000000000004', 'guesser@test.local'),
  ('be000000-0000-4000-8000-000000000005', 'invited@test.local');
insert into public.beta_codes (code, label, max_uses) values ('SOLO-1', 'one person', 1), ('GROUP', 'a group', null);
insert into public.beta_codes (code, expires_at) values ('OLD', now() - interval '1 day');
insert into public.beta_codes (code, active) values ('PAUSED', false);

select is(public.redeem_beta_code('be000000-0000-4000-8000-000000000001', ' solo-1 '), 'ok', 'a code works in any case and spacing');
select is(public.redeem_beta_code('be000000-0000-4000-8000-000000000001', 'GROUP'), 'already', 'a beta login needs no second code');
select is(public.redeem_beta_code('be000000-0000-4000-8000-000000000002', 'SOLO-1'), 'used_up', 'a one-use code is used up');
select is(public.redeem_beta_code('be000000-0000-4000-8000-000000000002', 'OLD'), 'expired', 'an old code has expired');
select is(public.redeem_beta_code('be000000-0000-4000-8000-000000000002', 'PAUSED'), 'off', 'a code turned off');
select is(public.redeem_beta_code('be000000-0000-4000-8000-000000000003', 'GROUP'), 'ok', 'a group code works for many');
select results_eq($$ select via, (select code from public.beta_codes c where c.id = a.code_id) from public.beta_access a
                     where user_id = 'be000000-0000-4000-8000-000000000003' $$,
  $$ values ('code'::text, 'GROUP'::text) $$, 'the record says which code');

select public.redeem_beta_code('be000000-0000-4000-8000-000000000004', 'NOPE' || g) from generate_series(1, 10) g;
select is(public.redeem_beta_code('be000000-0000-4000-8000-000000000004', 'GROUP'), 'too_many', '10 wrong tries: wait 15 minutes');

-- Joining a team by invite is beta access, with who invited.
insert into public.organizations (id, name) values ('be100000-0000-4000-8000-000000000001', 'Beta Team');
insert into public.organization_members (organization_id, user_id, role) values
  ('be100000-0000-4000-8000-000000000001', 'be000000-0000-4000-8000-000000000003', 'owner');
insert into public.organization_members (organization_id, user_id, role, invited_by) values
  ('be100000-0000-4000-8000-000000000001', 'be000000-0000-4000-8000-000000000005', 'member', 'be000000-0000-4000-8000-000000000003');
select results_eq($$ select via, invited_by from public.beta_access where user_id = 'be000000-0000-4000-8000-000000000005' $$,
  $$ values ('invite'::text, 'be000000-0000-4000-8000-000000000003'::uuid) $$, 'an invited teammate is a beta user');
select is((select uses from public.beta_codes where code = 'GROUP'), 1, 'uses count successful redeems only');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"be000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.redeem_beta_code('be000000-0000-4000-8000-000000000002', 'GROUP') $$, '42501', null,
  'redeeming is server only');
select throws_ok($$ select code from public.beta_codes $$, '42501', null, 'codes are hidden from the Data API');

select * from finish();
rollback;
