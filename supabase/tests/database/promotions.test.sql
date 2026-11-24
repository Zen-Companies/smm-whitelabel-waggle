-- Staff → Promotions (24 Nov): global, server-only tables. Owners and AI assistants can neither
-- read nor change them; the seed matches the code's defaults. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok((select relrowsecurity from pg_class where oid = 'public.promotions'::regclass),
  'promotions: RLS on');
select ok((select relrowsecurity from pg_class where oid = 'public.promotion_changes'::regclass),
  'promotion_changes: RLS on');

select results_eq(
  $$ select id, trial_days, ends_at from public.promotions order by id $$,
  $$ values ('black-friday-2026'::text, 30, '2026-12-01T04:59:59Z'::timestamptz),
            ('give-a-month'::text, 30, null::timestamptz) $$,
  'seeded with the code defaults');

select throws_ok(
  $$ insert into public.promotions (id, name, kind, trial_days) values ('too-long', 'X', 'seasonal', 91) $$,
  '23514', null, 'trial days stay within 1–90');

select throws_ok(
  $$ insert into public.promotions (id, name, kind, starts_at, ends_at)
     values ('backwards', 'X', 'seasonal', '2026-12-02', '2026-12-01') $$,
  '23514', null, 'ends after it starts');

-- A signed-in owner sees nothing and can change nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select count(*) from public.promotions $$, '42501', null,
  'an owner cannot read promotions');
select throws_ok($$ update public.promotions set trial_days = 90 $$, '42501', null,
  'an owner cannot change a promotion');
reset role;

select * from finish();
rollback;
