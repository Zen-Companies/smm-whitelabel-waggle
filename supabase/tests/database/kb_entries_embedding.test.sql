-- kb_entries: editing title or content clears the stale embedding; other updates keep it.
-- Run with `supabase test db` (pnpm test:db). Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.tenants (id, name) values ('c1000000-0000-4000-8000-000000000001', 'Tenant C');
insert into public.kb_entries (id, tenant_id, title, content, embedding) values
  ('c5000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Hours', '9-5', array_fill(0.1::real, array[1536])::extensions.vector);

select isnt((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'insert keeps the given embedding');

update public.kb_entries set content = '8-4' where id = 'c5000000-0000-4000-8000-000000000001';
select is((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'changing content clears the embedding');

update public.kb_entries set embedding = array_fill(0.1::real, array[1536])::extensions.vector where id = 'c5000000-0000-4000-8000-000000000001';
select isnt((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'writing only the embedding keeps it (re-embed job)');

update public.kb_entries set title = 'Opening hours' where id = 'c5000000-0000-4000-8000-000000000001';
select is((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'changing title clears the embedding');

update public.kb_entries set embedding = array_fill(0.1::real, array[1536])::extensions.vector where id = 'c5000000-0000-4000-8000-000000000001';
update public.kb_entries set title = 'Opening hours', content = '8-4' where id = 'c5000000-0000-4000-8000-000000000001';
select isnt((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'saving unchanged title and content keeps the embedding');

update public.kb_entries set content = 'Mon-Fri 8-4', embedding = array_fill(0.2::real, array[1536])::extensions.vector where id = 'c5000000-0000-4000-8000-000000000001';
select is((select embedding from public.kb_entries where id = 'c5000000-0000-4000-8000-000000000001'), null,
  'a text change clears the embedding even if one is written in the same update');

select throws_ok(
  $$ update public.kb_entries set embedding = '[1,2,3]' where id = 'c5000000-0000-4000-8000-000000000001' $$,
  '22000', null, 'only 1536-dimension embeddings fit (openai/text-embedding-3-small)');

-- Retrieval: tenant-scoped, ordered by similarity.
insert into public.tenants (id, name) values ('c1000000-0000-4000-8000-000000000002', 'Tenant D');
insert into public.kb_entries (tenant_id, title, content, embedding) values
  ('c1000000-0000-4000-8000-000000000002', 'Other tenant', 'x', array_fill(0.1::real, array[1536])::extensions.vector);
update public.kb_entries set embedding = array_fill(0.1::real, array[1536])::extensions.vector
  where id = 'c5000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select title from public.match_kb_entries('c1000000-0000-4000-8000-000000000001',
       array_fill(0.1::real, array[1536])::extensions.vector, 5) $$,
  $$ values ('Opening hours'::text) $$,
  'match_kb_entries only returns the given tenant''s entries');

select * from finish();
rollback;
