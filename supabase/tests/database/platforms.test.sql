-- All platforms, wave 1: accounts on any Zernio platform, nothing else. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into public.tenants (id, name) values ('f9000000-0000-4000-8000-000000000001', 'Platforms Cafe');

select lives_ok(
  $$ insert into public.social_accounts (tenant_id, zernio_account_id, platform) values
       ('f9000000-0000-4000-8000-000000000001', 'acc_tt', 'tiktok'),
       ('f9000000-0000-4000-8000-000000000001', 'acc_gbp', 'googlebusiness'),
       ('f9000000-0000-4000-8000-000000000001', 'acc_x', 'twitter') $$,
  'TikTok, Google Business and X accounts can be stored');

select throws_ok(
  $$ insert into public.social_accounts (tenant_id, zernio_account_id, platform) values
       ('f9000000-0000-4000-8000-000000000001', 'acc_ms', 'myspace') $$,
  '23514', null,
  'a platform Zernio does not offer is refused');

select throws_ok(
  $$ insert into public.social_accounts (tenant_id, zernio_account_id, platform) values
       ('f9000000-0000-4000-8000-000000000001', 'acc_up', 'Instagram') $$,
  '23514', null,
  'ids are Zernio''s lowercase ids');

select * from finish();
rollback;
