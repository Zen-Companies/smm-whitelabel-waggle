-- Row level security (docs/tdd.md §13).
-- Members read every row of their tenants. They write only owner-authored content, and only the
-- columns granted below. Pipeline tables (items, drafts, leads, audit, usage, accounts) are written by
-- server code with the service-role client, which bypasses RLS.

-- security definer so tenant_members policies don't recurse into themselves.
create function private.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id from public.tenant_members where user_id = (select auth.uid());
$$;
revoke all on function private.user_tenant_ids() from public;
grant execute on function private.user_tenant_ids() to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.social_accounts enable row level security;
alter table public.posts enable row level security;
alter table public.webhook_events enable row level security;
alter table public.conversations enable row level security;
alter table public.inbound_items enable row level security;
alter table public.drafts enable row level security;
alter table public.kb_entries enable row level security;
alter table public.autonomy_settings enable row level security;
alter table public.leads enable row level security;
alter table public.audit_log enable row level security;
alter table public.ai_usage enable row level security;

-- Start from nothing; grant back only what clients need.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Read access: every tenant table.
grant select on
  public.tenants, public.tenant_members, public.social_accounts, public.posts,
  public.conversations, public.inbound_items, public.drafts, public.kb_entries,
  public.autonomy_settings, public.leads, public.audit_log, public.ai_usage
to authenticated;

create policy "members read their tenant" on public.tenants
  for select to authenticated using (id in (select private.user_tenant_ids()));

create policy "members read their tenant" on public.tenant_members
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.social_accounts
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.posts
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.conversations
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.inbound_items
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.drafts
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.kb_entries
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.autonomy_settings
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.leads
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.audit_log
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.ai_usage
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));

-- Write access: owner-authored content only, column by column.

-- Tenant settings (billing and Zernio ids stay server-side).
grant update (name, confidence_threshold) on public.tenants to authenticated;
create policy "members update their tenant" on public.tenants
  for update to authenticated
  using (id in (select private.user_tenant_ids()))
  with check (id in (select private.user_tenant_ids()));

-- Knowledge base (embedding is written server-side after save).
grant insert (tenant_id, title, content), update (title, content), delete
  on public.kb_entries to authenticated;
create policy "members insert into their tenant" on public.kb_entries
  for insert to authenticated with check (tenant_id in (select private.user_tenant_ids()));
create policy "members update their tenant" on public.kb_entries
  for update to authenticated
  using (tenant_id in (select private.user_tenant_ids()))
  with check (tenant_id in (select private.user_tenant_ids()));
create policy "members delete from their tenant" on public.kb_entries
  for delete to authenticated using (tenant_id in (select private.user_tenant_ids()));

-- Post drafts (status, Zernio ids and errors come from the publishing job and webhooks).
grant insert (tenant_id, content, media, target_account_ids, scheduled_for),
  update (content, media, target_account_ids, scheduled_for)
  on public.posts to authenticated;
create policy "members insert into their tenant" on public.posts
  for insert to authenticated with check (tenant_id in (select private.user_tenant_ids()));
create policy "members update their tenant" on public.posts
  for update to authenticated
  using (tenant_id in (select private.user_tenant_ids()))
  with check (tenant_id in (select private.user_tenant_ids()));

-- Autonomy mode per category (rows are created by the tenants trigger).
grant update (mode) on public.autonomy_settings to authenticated;
create policy "members update their tenant" on public.autonomy_settings
  for update to authenticated
  using (tenant_id in (select private.user_tenant_ids()))
  with check (tenant_id in (select private.user_tenant_ids()));

-- webhook_events: RLS on, no policies, no grants: service role only.
