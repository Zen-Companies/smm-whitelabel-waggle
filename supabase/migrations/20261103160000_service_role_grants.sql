-- Hosted Supabase projects created now no longer grant the API roles access to new tables in
-- `public` by default; the local stack still does. The app's server-only service-role client
-- (CLAUDE.md rule 9) relied on that default, so on a new hosted project every service-role read
-- failed with "permission denied". Grant it explicitly, for today's objects and future ones.
-- Clients (anon, authenticated) keep only the grants given in 20261028123209_rls_policies.sql.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
