-- Realtime isolation (docs/tdd.md §13). postgres_changes are authorized by RLS, except DELETE:
-- realtime.apply_rls sends a DELETE to every subscriber of the table without an RLS check (the row
-- is gone), so another tenant's deletes reached any signed-in client (row id only). Publish only
-- inserts and updates; nothing in the app listens for deletes.
--
-- Publication-wide on purpose: it covers every table added later. Supabase creates
-- supabase_realtime on every project, so this applies to the hosted database through
-- `supabase db push` like any migration. Don't re-enable deletes in the dashboard
-- (Database → Publications); supabase/tests/database/realtime_publication.test.sql checks it.
alter publication supabase_realtime set (publish = 'insert, update');
