-- kb_entries: editing title or content clears the stale embedding; other updates keep it.
-- Run with `supabase test db` (pnpm test:db). Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.tenants (id, name) values ('c1000000-0000-4000-8000-000000000001', 'Tenant C');
insert into public.kb_entries (id, tenant_id, title, content, embedding) values
  ('c5000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Hours', '9-5', '[1,2,3]');

select isnt((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'insert keeps the given embedding');

update public.kb_entries set content = '8-4' where id = 'c5000000-0000-4000-8000-000000000001';
select is((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'changing content clears the embedding');

update public.kb_entries set embedding = '[1,2,3]' where id = 'c5000000-0000-4000-8000-000000000001';
select isnt((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'writing only the embedding keeps it (re-embed job)');

update public.kb_entries set title = 'Opening hours' where id = 'c5000000-0000-4000-8000-000000000001';
select is((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'changing title clears the embedding');

update public.kb_entries set embedding = '[1,2,3]' where id = 'c5000000-0000-4000-8000-000000000001';
update public.kb_entries set title = 'Opening hours', content = '8-4' where id = 'c5000000-0000-4000-8000-000000000001';
select isnt((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'saving unchanged title and content keeps the embedding');

update public.kb_entries set content = 'Mon-Fri 8-4', embedding = '[4,5,6]' where id = 'c5000000-0000-4000-8000-000000000001';
select is((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'a text change clears the embedding even if one is written in the same update');

select * from finish();
rollback;
