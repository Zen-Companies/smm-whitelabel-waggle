-- MCP Phase 2 (docs/mcp/PLAN.md §4.4): an AI assistant's OAuth token (a JWT with client_id) reads
-- nothing through the Data API; the owner's own session is unaffected. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Every table with RLS refuses OAuth clients, so a new table can't forget it.
select is_empty(
  $$ select t.tablename::text from pg_tables t
     where t.schemaname = 'public' and t.rowsecurity
       and not exists (
         select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and p.policyname = 'no oauth clients' and p.permissive = 'RESTRICTIVE'
       ) $$,
  'every RLS table has the restrictive "no oauth clients" policy'
);

insert into auth.users (id, email) values ('c0000000-0000-4000-8000-000000000001', 'oauth@test.local');
insert into public.tenants (id, name) values ('c1000000-0000-4000-8000-000000000001', 'Tenant C');
insert into public.tenant_members (tenant_id, user_id)
  values ('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');
insert into public.kb_entries (tenant_id, title, content)
  values ('c1000000-0000-4000-8000-000000000001', 'Hours', '9-5');
insert into public.mcp_grants (user_id, client_id, client_name, tenant_ids)
  values ('c0000000-0000-4000-8000-000000000001', 'client-1', 'Claude', '{c1000000-0000-4000-8000-000000000001}');

set local role authenticated;

-- The owner's browser session: their rows, as before.
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq($$ select count(*)::int from public.tenants $$, array[1], 'owner session reads its tenant');
select results_eq($$ select count(*)::int from public.mcp_grants $$, array[1], 'owner session reads its grants');

-- The same user through an AI assistant's token: nothing.
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","client_id":"client-1"}', true);
select is_empty($$ select id from public.tenants $$, 'oauth token: no tenants');
select is_empty($$ select id from public.kb_entries $$, 'oauth token: no kb entries');
select is_empty($$ select id from public.mcp_grants $$, 'oauth token: no grants');
select throws_ok(
  $$ insert into public.kb_entries (tenant_id, title, content)
     values ('c1000000-0000-4000-8000-000000000001', 'x', 'y') $$,
  '42501', null, 'oauth token: no writes'
);

select * from finish();
rollback;
