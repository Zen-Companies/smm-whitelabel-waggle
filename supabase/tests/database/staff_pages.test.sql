-- MCP Phase 4 (docs/mcp/PLAN.md §7): the login lookups are server-only, and owners can't mark
-- their own brand as a test brand (the playground acts on test brands). Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('e0000000-0000-4000-8000-000000000001', 'owner-e@test.local');
insert into public.tenants (id, name) values ('e1000000-0000-4000-8000-000000000001', 'Tenant E');
insert into public.tenant_members (tenant_id, user_id)
  values ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001');

select is(
  public.user_id_by_email(' OWNER-E@test.local '),
  'e0000000-0000-4000-8000-000000000001'::uuid,
  'the server finds a login by email, any case'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.user_emails(array['e0000000-0000-4000-8000-000000000001']::uuid[]) $$,
  '42501', null, 'user_emails: server only'
);
select throws_ok(
  $$ select public.user_id_by_email('owner-e@test.local') $$,
  '42501', null, 'user_id_by_email: server only'
);
select throws_ok(
  $$ update public.tenants set is_test = true where id = 'e1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'an owner cannot mark their brand as a test brand'
);
select throws_ok(
  $$ update public.tenants set mcp_daily_send_cap = 5000 where id = 'e1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'an owner cannot raise their own AI send limit'
);

select * from finish();
rollback;
