-- T55: writes through the signed-in user's client follow the role (docs/orgs/PLAN.md). Reads
-- stay open to every member of a brand. The Server Actions check the same abilities first.

-- Brands where the signed-in user has one of the given roles.
create function private.user_tenant_ids_with(p_roles text[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.tenant_id
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = (select auth.uid()) and t.offboarded_at is null and m.role = any (p_roles);
$$;
revoke all on function private.user_tenant_ids_with(text[]) from public;
grant execute on function private.user_tenant_ids_with(text[]) to authenticated;

-- Brand settings (name, business profile, reply rules, auto-hide, pause): owners and admins.
drop policy "members update their tenant" on public.tenants;
create policy "owners and admins update their brand" on public.tenants
  for update to authenticated
  using (id in (select private.user_tenant_ids_with(array['owner', 'admin'])))
  with check (id in (select private.user_tenant_ids_with(array['owner', 'admin'])));

drop policy "members update their tenant" on public.autonomy_settings;
create policy "owners and admins update reply rules" on public.autonomy_settings
  for update to authenticated
  using (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin'])))
  with check (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin'])));

-- Business info: owners and admins.
drop policy "members insert into their tenant" on public.kb_entries;
drop policy "members update their tenant" on public.kb_entries;
drop policy "members delete from their tenant" on public.kb_entries;
create policy "owners and admins add business info" on public.kb_entries
  for insert to authenticated
  with check (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin'])));
create policy "owners and admins edit business info" on public.kb_entries
  for update to authenticated
  using (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin'])))
  with check (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin'])));
create policy "owners and admins delete business info" on public.kb_entries
  for delete to authenticated
  using (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin'])));

-- Posts: everyone but viewers.
drop policy "members insert into their tenant" on public.posts;
drop policy "members update their tenant" on public.posts;
create policy "members write posts" on public.posts
  for insert to authenticated
  with check (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin', 'member'])));
create policy "members edit posts" on public.posts
  for update to authenticated
  using (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin', 'member'])))
  with check (tenant_id in (select private.user_tenant_ids_with(array['owner', 'admin', 'member'])));
