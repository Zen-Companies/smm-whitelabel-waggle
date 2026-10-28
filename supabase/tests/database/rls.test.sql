-- RLS: a member of tenant A can't read or write tenant B's rows (docs/tasks.md T1).
-- Run with `supabase test db` (pnpm test:db). Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- Fixtures, as postgres (bypasses RLS) ---------------------------------------------------------

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'owner-a@test.local'),
  ('b0000000-0000-4000-8000-000000000001', 'owner-b@test.local');

insert into public.tenants (id, name) values
  ('a1000000-0000-4000-8000-000000000001', 'Tenant A'),
  ('b1000000-0000-4000-8000-000000000001', 'Tenant B');

insert into public.tenant_members (tenant_id, user_id) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');

insert into public.social_accounts (id, tenant_id, zernio_account_id, platform) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'acc_a', 'instagram'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'acc_b', 'instagram');

insert into public.conversations (id, tenant_id, social_account_id, zernio_conversation_id, platform) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'conv_a', 'instagram'),
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'conv_b', 'instagram');

insert into public.inbound_items (id, tenant_id, social_account_id, kind, zernio_message_id, conversation_id, text, received_at) values
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'dm', 'msg_a', 'a3000000-0000-4000-8000-000000000001', 'hi from A', now()),
  ('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'dm', 'msg_b', 'b3000000-0000-4000-8000-000000000001', 'hi from B', now());

insert into public.drafts (tenant_id, item_id, body) values
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'reply A'),
  ('b1000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'reply B');

insert into public.posts (tenant_id, content, target_account_ids) values
  ('a1000000-0000-4000-8000-000000000001', 'post A', '{a2000000-0000-4000-8000-000000000001}'),
  ('b1000000-0000-4000-8000-000000000001', 'post B', '{b2000000-0000-4000-8000-000000000001}');

insert into public.kb_entries (id, tenant_id, title, content) values
  ('a5000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Hours A', '9-5'),
  ('b5000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Hours B', '9-5');

insert into public.leads (tenant_id, item_id, name) values
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Lead A'),
  ('b1000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'Lead B');

insert into public.audit_log (tenant_id, item_id, action, actor) values
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'classified', 'system'),
  ('b1000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'classified', 'system');

insert into public.ai_usage (tenant_id, item_id, purpose, provider, model) values
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'classify', 'jev', 'jev-test'),
  ('b1000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'classify', 'jev', 'jev-test');

insert into public.webhook_events (id, source, event_type, payload)
values ('evt_1', 'zernio', 'message.received', '{}');

-- Schema rules (CLAUDE.md rule 9) -------------------------------------------------------------

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every public table has RLS enabled'
);

select is_empty(
  $$ select t.table_name from information_schema.tables t
     where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and t.table_name not in ('tenants', 'webhook_events')
       and not exists (select 1 from information_schema.columns c
                       where c.table_schema = 'public' and c.table_name = t.table_name
                         and c.column_name = 'tenant_id') $$,
  'every tenant table has tenant_id'
);

-- Default autonomy settings (PRD F9) ----------------------------------------------------------

select results_eq(
  $$ select category, mode from public.autonomy_settings
     where tenant_id = 'a1000000-0000-4000-8000-000000000001' order by category $$,
  $$ values ('complaint', 'off'), ('faq', 'approve'), ('lead', 'approve'), ('spam', 'off'), ('unclear', 'off') $$,
  'a new tenant gets the PRD F9 default autonomy settings'
);

-- Cross-tenant references are impossible even for the service role -----------------------------

select throws_ok(
  $$ insert into public.drafts (tenant_id, item_id, body)
     values ('a1000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'x') $$,
  '23503', null, 'a draft cannot point at another tenant''s item'
);

-- Act as the owner of tenant A ------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Reads: A sees its own rows and none of B's, on every tenant table.

select results_eq($$ select name from public.tenants $$, $$ values ('Tenant A') $$, 'tenants: only A');
select results_eq($$ select count(*)::int from public.tenant_members $$, array[1], 'tenant_members: only A');
select results_eq($$ select zernio_account_id from public.social_accounts $$, $$ values ('acc_a') $$, 'social_accounts: only A');
select results_eq($$ select zernio_conversation_id from public.conversations $$, $$ values ('conv_a') $$, 'conversations: only A');
select results_eq($$ select text from public.inbound_items $$, $$ values ('hi from A') $$, 'inbound_items: only A');
select results_eq($$ select body from public.drafts $$, $$ values ('reply A') $$, 'drafts: only A');
select results_eq($$ select content from public.posts $$, $$ values ('post A') $$, 'posts: only A');
select results_eq($$ select title from public.kb_entries $$, $$ values ('Hours A') $$, 'kb_entries: only A');
select results_eq($$ select count(*)::int from public.autonomy_settings $$, array[5], 'autonomy_settings: only A');
select results_eq($$ select name from public.leads $$, $$ values ('Lead A') $$, 'leads: only A');
select results_eq($$ select count(*)::int from public.audit_log $$, array[1], 'audit_log: only A');
select results_eq($$ select count(*)::int from public.ai_usage $$, array[1], 'ai_usage: only A');
select throws_ok($$ select * from public.webhook_events $$, '42501', null, 'webhook_events: no client access');

-- Writes on B's rows: updates and deletes match nothing, inserts are refused.

select is_empty($$ update public.tenants set name = 'pwned' where id = 'b1000000-0000-4000-8000-000000000001' returning id $$,
  'cannot update B''s tenant');
select is_empty($$ update public.kb_entries set title = 'pwned' where tenant_id = 'b1000000-0000-4000-8000-000000000001' returning id $$,
  'cannot update B''s kb entries');
select is_empty($$ delete from public.kb_entries where tenant_id = 'b1000000-0000-4000-8000-000000000001' returning id $$,
  'cannot delete B''s kb entries');
select is_empty($$ update public.posts set content = 'pwned' where tenant_id = 'b1000000-0000-4000-8000-000000000001' returning id $$,
  'cannot update B''s posts');
select is_empty($$ update public.autonomy_settings set mode = 'auto' where tenant_id = 'b1000000-0000-4000-8000-000000000001' returning category $$,
  'cannot update B''s autonomy settings');

select throws_ok(
  $$ insert into public.kb_entries (tenant_id, title, content) values ('b1000000-0000-4000-8000-000000000001', 'x', 'y') $$,
  '42501', null, 'cannot insert kb entries into B');
select throws_ok(
  $$ insert into public.posts (tenant_id, content) values ('b1000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'cannot insert posts into B');
select throws_ok(
  $$ update public.kb_entries set tenant_id = 'b1000000-0000-4000-8000-000000000001' where id = 'a5000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'cannot move own kb entry to B');
select throws_ok(
  $$ insert into public.posts (tenant_id, content, target_account_ids)
     values ('a1000000-0000-4000-8000-000000000001', 'x', '{b2000000-0000-4000-8000-000000000001}') $$,
  '23503', null, 'cannot target B''s social account from A''s post');

-- Pipeline tables are read-only for members, even in their own tenant.

select throws_ok($$ insert into public.inbound_items (tenant_id, social_account_id, kind, zernio_comment_id, text, received_at)
  values ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'comment', 'c1', 'x', now()) $$,
  '42501', null, 'cannot insert inbound items');
select throws_ok($$ update public.inbound_items set status = 'sent' $$, '42501', null, 'cannot change item status');
select throws_ok($$ update public.drafts set status = 'approved' $$, '42501', null, 'cannot update drafts directly');
select throws_ok($$ insert into public.drafts (tenant_id, item_id, body)
  values ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'cannot insert drafts');
select throws_ok($$ insert into public.leads (tenant_id, item_id) values ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'cannot insert leads');
select throws_ok($$ insert into public.audit_log (tenant_id, action, actor) values ('a1000000-0000-4000-8000-000000000001', 'x', 'system') $$,
  '42501', null, 'cannot write audit_log');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'cannot delete audit_log');
select throws_ok($$ insert into public.ai_usage (tenant_id, purpose, provider, model) values ('a1000000-0000-4000-8000-000000000001', 'draft', 'x', 'y') $$,
  '42501', null, 'cannot write ai_usage');
select throws_ok($$ update public.social_accounts set status = 'active' $$, '42501', null, 'cannot update social accounts');
select throws_ok($$ update public.conversations set participant_name = 'x' $$, '42501', null, 'cannot update conversations');
select throws_ok($$ insert into public.tenant_members (tenant_id, user_id) values ('b1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'cannot join B by inserting a membership');
select throws_ok($$ insert into public.tenants (name) values ('new') $$, '42501', null, 'cannot create tenants');
select throws_ok($$ update public.tenants set subscription_status = 'active' $$, '42501', null, 'cannot change own billing status');
select throws_ok($$ update public.kb_entries set embedding = null $$, '42501', null, 'cannot write embeddings');
select throws_ok($$ update public.posts set status = 'published' $$, '42501', null, 'cannot change post status');

-- Allowed writes in A's own tenant.

select results_eq($$ update public.tenants set confidence_threshold = 0.9 returning name $$, $$ values ('Tenant A') $$,
  'can update own tenant settings');
select lives_ok($$ insert into public.kb_entries (tenant_id, title, content) values ('a1000000-0000-4000-8000-000000000001', 'New', 'z') $$,
  'can add own kb entry');
select results_eq($$ update public.kb_entries set content = '8-4' where id = 'a5000000-0000-4000-8000-000000000001' returning title $$,
  $$ values ('Hours A') $$, 'can edit own kb entry');
select lives_ok($$ insert into public.posts (tenant_id, content, target_account_ids)
  values ('a1000000-0000-4000-8000-000000000001', 'new post', '{a2000000-0000-4000-8000-000000000001}') $$,
  'can draft own post targeting own account');
select results_eq($$ update public.autonomy_settings set mode = 'auto' where category = 'faq' returning mode $$,
  $$ values ('auto') $$, 'can change own autonomy mode');
select results_eq($$ delete from public.kb_entries where title = 'New' returning title $$, $$ values ('New') $$,
  'can delete own kb entry');

-- Back to postgres: B's rows are untouched -------------------------------------------------------

reset role;

select results_eq($$ select name from public.tenants where id = 'b1000000-0000-4000-8000-000000000001' $$,
  $$ values ('Tenant B') $$, 'B''s tenant unchanged');
select results_eq($$ select title from public.kb_entries where tenant_id = 'b1000000-0000-4000-8000-000000000001' $$,
  $$ values ('Hours B') $$, 'B''s kb entry unchanged');
select results_eq($$ select content from public.posts where tenant_id = 'b1000000-0000-4000-8000-000000000001' $$,
  $$ values ('post B') $$, 'B''s post unchanged');
select results_eq($$ select mode from public.autonomy_settings where tenant_id = 'b1000000-0000-4000-8000-000000000001' and category = 'faq' $$,
  $$ values ('approve') $$, 'B''s autonomy unchanged');
select results_eq($$ select count(*)::int from public.tenant_members where user_id = 'a0000000-0000-4000-8000-000000000001' $$,
  array[1], 'A did not join B');

-- Anonymous visitors see nothing ----------------------------------------------------------------

set local role anon;
select throws_ok($$ select * from public.tenants $$, '42501', null, 'anon cannot read tenants');
select throws_ok($$ select * from public.inbound_items $$, '42501', null, 'anon cannot read inbound items');
select throws_ok($$ select * from public.kb_entries $$, '42501', null, 'anon cannot read kb entries');
reset role;

select * from finish();
rollback;
