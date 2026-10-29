-- Realtime isolation guard (docs/tdd.md §13, CLAUDE.md rule 15).
begin;
select plan(4);

select is(
  (select pubdelete from pg_publication where pubname = 'supabase_realtime'),
  false,
  'supabase_realtime does not publish deletes (they bypass RLS in Realtime)'
);
select is(
  (select pubinsert and pubupdate from pg_publication where pubname = 'supabase_realtime'),
  true,
  'supabase_realtime publishes inserts and updates'
);
-- Every published public table is a tenant table with RLS on and default replica identity
-- (FULL would put whole old rows into change events).
select is_empty(
  $$ select c.relname
     from pg_publication_tables pt
     join pg_class c on c.relname = pt.tablename
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = pt.schemaname
     where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
       and (not c.relrowsecurity or c.relreplident = 'f') $$,
  'published tables have RLS and no REPLICA IDENTITY FULL'
);
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' $$,
  array['drafts', 'inbound_items'],
  'only the tables covered by realtime-isolation.test.ts are published'
);

select * from finish();
rollback;
