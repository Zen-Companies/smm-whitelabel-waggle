-- Help & feedback: a note needs words, a rating needs a rating, and none of it is reachable from
-- the Data API (the server reads a login's own rows). Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('fb000000-0000-4000-8000-000000000001', 'fb@test.local');

select lives_ok($$ insert into public.feedback (user_id, kind, message, page)
  values ('fb000000-0000-4000-8000-000000000001', 'note', 'Times show in UTC', 'analytics') $$, 'a note with words');
select throws_ok($$ insert into public.feedback (user_id, kind, message, page)
  values ('fb000000-0000-4000-8000-000000000001', 'note', '   ', 'analytics') $$, '23514', null, 'an empty note is refused');
select lives_ok($$ insert into public.feedback (user_id, kind, rating, page)
  values ('fb000000-0000-4000-8000-000000000001', 'rating', 'not_good', 'inbox') $$, 'a rating');
select throws_ok($$ insert into public.feedback (user_id, kind, page)
  values ('fb000000-0000-4000-8000-000000000001', 'rating', 'inbox') $$, '23514', null, 'a rating needs good or not good');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fb000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select message from public.feedback $$, '42501', null, 'server only, even for the author');

select * from finish();
rollback;
