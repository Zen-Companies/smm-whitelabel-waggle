-- T55: through the Data API a viewer changes nothing, a member writes posts but not business
-- info or settings, an admin changes settings. Reads stay open to all. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-000000000001', 'owner-e@test.local'),
  ('e0000000-0000-4000-8000-000000000002', 'admin-e@test.local'),
  ('e0000000-0000-4000-8000-000000000003', 'member-e@test.local'),
  ('e0000000-0000-4000-8000-000000000004', 'viewer-e@test.local');
insert into public.tenants (id, name) values ('e1000000-0000-4000-8000-000000000001', 'Brand E');
insert into public.tenant_members (tenant_id, user_id, role) values
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'owner');
insert into public.tenant_members (tenant_id, user_id, role) values
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'admin'),
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'member'),
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 'viewer');

set local role authenticated;

-- Viewer
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.tenants where id = 'e1000000-0000-4000-8000-000000000001'), 1,
  'a viewer reads the brand');
select is_empty($$ update public.tenants set name = 'Hacked' where id = 'e1000000-0000-4000-8000-000000000001' returning id $$,
  'a viewer can''t rename the brand');
select throws_ok($$ insert into public.posts (tenant_id, content, target_account_ids)
  values ('e1000000-0000-4000-8000-000000000001', 'x', '{}') $$, '42501', null, 'a viewer can''t write posts');

-- Member
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok($$ insert into public.posts (tenant_id, content, target_account_ids)
  values ('e1000000-0000-4000-8000-000000000001', 'Ube is back', '{}') $$, 'a member writes posts');
select throws_ok($$ insert into public.kb_entries (tenant_id, title, content)
  values ('e1000000-0000-4000-8000-000000000001', 'Hours', '9-5') $$, '42501', null,
  'a member can''t add business info');
select is_empty($$ update public.autonomy_settings set mode = 'auto'
  where tenant_id = 'e1000000-0000-4000-8000-000000000001' returning tenant_id $$,
  'a member can''t change reply rules');

-- Admin
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select isnt_empty($$ update public.tenants set name = 'Brand E2' where id = 'e1000000-0000-4000-8000-000000000001' returning id $$,
  'an admin renames the brand');
select lives_ok($$ insert into public.kb_entries (tenant_id, title, content)
  values ('e1000000-0000-4000-8000-000000000001', 'Hours', '9-5') $$, 'an admin adds business info');
select isnt_empty($$ update public.autonomy_settings set mode = 'off'
  where tenant_id = 'e1000000-0000-4000-8000-000000000001' and category = 'faq' returning tenant_id $$,
  'an admin changes reply rules');

select * from finish();
rollback;
