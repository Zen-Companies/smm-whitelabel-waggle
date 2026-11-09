-- MCP Phase 3 (docs/mcp/PLAN.md §7): the staff permission matrix as approved, and the new
-- server-only tables (staff, feature switches, MCP activity) hidden from owners. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select results_eq(
  $$ select role, count(*)::int from public.staff_role_permissions group by role order by role $$,
  $$ values ('admin', 9), ('developer', 5), ('support', 2), ('viewer', 3) $$,
  'each role has the approved number of permissions'
);
select results_eq(
  $$ select permission from public.staff_role_permissions where role = 'support' order by 1 $$,
  $$ values ('mcp.audit.view'), ('mcp.docs.view') $$,
  'support: docs and activity only'
);
select is_empty(
  $$ select 1 from public.staff_role_permissions
     where role <> 'admin' and permission in ('flags.manage', 'staff.manage', 'admin.caps.manage', 'brands.manage') $$,
  'only admins manage switches, staff, AI caps and brands'
);

insert into auth.users (id, email) values ('d0000000-0000-4000-8000-000000000001', 'owner@test.local');
insert into public.tenants (id, name) values ('d1000000-0000-4000-8000-000000000001', 'Tenant D');
insert into public.tenant_members (tenant_id, user_id)
  values ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');
insert into public.staff_members (user_id, role) values ('d0000000-0000-4000-8000-000000000001', 'admin');
insert into public.feature_flags (key, tenant_id, enabled)
  values ('mcp', 'd1000000-0000-4000-8000-000000000001', true);
insert into public.mcp_calls (user_id, client_id, tenant_id, tool, kind)
  values ('d0000000-0000-4000-8000-000000000001', 'c', 'd1000000-0000-4000-8000-000000000001', 'list_inbox', 'read');

select throws_ok(
  $$ insert into public.feature_flags (key, tenant_id, enabled)
     values ('mcp', 'd1000000-0000-4000-8000-000000000001', false) $$,
  '23505', null, 'one switch per key and brand'
);

-- Even a staff member's own browser session can't read it (no grant): only the server reads it.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select 1 from public.staff_members $$, '42501', null, 'staff_members: server only');
select throws_ok($$ select 1 from public.staff_role_permissions $$, '42501', null, 'staff_role_permissions: server only');
select throws_ok($$ select 1 from public.feature_flags $$, '42501', null, 'feature_flags: server only');
select throws_ok($$ select 1 from public.mcp_calls $$, '42501', null, 'mcp_calls: server only');

select * from finish();
rollback;
