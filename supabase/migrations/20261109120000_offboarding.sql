-- T21 customer offboarding (decided 2026-11-09): our admins offboard a brand from the staff
-- Brands page. It is soft-deleted for 3 months (owners lose access at once, staff can restore),
-- then its content is deleted for good. Costs (ai_usage) and the audit log stay, scrubbed of
-- free text. Zernio clean-up (disconnect accounts now, delete the profile at the hard delete) is
-- done by server code around these functions.

alter table public.tenants
  add column offboarded_at timestamptz,
  add column offboarded_by uuid references auth.users (id) on delete set null,
  add column purge_after timestamptz,
  add column purge_tried_at timestamptz,
  add column purged_at timestamptz,
  -- Set while a Zernio step of offboarding or the hard delete failed ("Needs attention").
  add column offboard_issue text,
  add constraint tenants_offboard_consistent check (
    (offboarded_at is null and purge_after is null and purged_at is null)
    or (offboarded_at is not null and purge_after is not null)
  );
create index tenants_purge_due_idx on public.tenants (purge_after)
  where offboarded_at is not null and purged_at is null;

-- When the account was removed from Zernio (DELETE /v1/accounts/{id}). A profile can't be
-- deleted while any of its accounts is still there.
alter table public.social_accounts add column released_at timestamptz;

-- Owners lose access to an offboarded brand: every RLS policy reads its tenants from here.
create or replace function private.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.tenant_id
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = (select auth.uid()) and t.offboarded_at is null;
$$;

-- Costs and the audit log outlive an item's deletion (they used to cascade with it).
alter table public.audit_log drop constraint audit_log_item_id_tenant_id_fkey;
alter table public.audit_log add constraint audit_log_item_id_tenant_id_fkey
  foreign key (item_id, tenant_id) references public.inbound_items (id, tenant_id)
  on delete set null (item_id);
alter table public.ai_usage drop constraint ai_usage_item_id_tenant_id_fkey;
alter table public.ai_usage add constraint ai_usage_item_id_tenant_id_fkey
  foreign key (item_id, tenant_id) references public.inbound_items (id, tenant_id)
  on delete set null (item_id);

-- Adding a brand with the name of one that was offboarded makes a new brand.
create or replace function public.create_brand(p_user_id uuid, p_name text)
returns table (tenant_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_tenant_id uuid;
begin
  if v_name = '' then
    raise exception 'brand name is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner_tenant:' || p_user_id::text, 0));

  select m.tenant_id into v_tenant_id
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = p_user_id and m.role = 'owner' and lower(btrim(t.name)) = lower(v_name)
    and t.offboarded_at is null
  limit 1;

  if v_tenant_id is not null then
    return query select v_tenant_id, false;
    return;
  end if;

  insert into public.tenants (name) values (v_name) returning id into v_tenant_id;
  insert into public.tenant_members (tenant_id, user_id, role)
    values (v_tenant_id, p_user_id, 'owner');
  insert into public.audit_log (tenant_id, action, actor, details)
    values (v_tenant_id, 'tenant_created', p_user_id::text, '{"via": "add_brand"}'::jsonb);

  return query select v_tenant_id, true;
end;
$$;

-- Soft delete. Returns the date the content will be deleted, or null when the brand doesn't
-- exist or is already offboarded.
create function public.offboard_tenant(p_tenant_id uuid, p_actor uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purge timestamptz;
begin
  update public.tenants
  set offboarded_at = now(), offboarded_by = p_actor, purge_after = now() + interval '3 months',
      purge_tried_at = null, offboard_issue = null
  where id = p_tenant_id and offboarded_at is null
  returning purge_after into v_purge;
  if v_purge is null then
    return null;
  end if;
  insert into public.audit_log (tenant_id, action, actor, details)
    values (p_tenant_id, 'brand_offboarded', coalesce(p_actor::text, 'system'),
            jsonb_build_object('purgeAfter', v_purge));
  return v_purge;
end;
$$;

-- Undo within the 3 months. Accounts stay disconnected until the owner reconnects them.
create function public.restore_tenant(p_tenant_id uuid, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tenants
  set offboarded_at = null, offboarded_by = null, purge_after = null, purge_tried_at = null,
      offboard_issue = null
  where id = p_tenant_id and offboarded_at is not null and purged_at is null;
  if not found then
    return false;
  end if;
  insert into public.audit_log (tenant_id, action, actor, details)
    values (p_tenant_id, 'brand_restored', coalesce(p_actor::text, 'system'), '{}'::jsonb);
  return true;
end;
$$;

-- The hard delete, once the 3 months are over. Everything the brand made or received goes; the
-- tenant row stays (name and billing ids) so costs and the audit log still add up. Any table
-- added later with a tenant_id must be listed here or in supabase/tests/database/offboarding.
create function public.purge_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.tenants
  where id = p_tenant_id and offboarded_at is not null and purge_after <= now()
    and purged_at is null
  for update;
  if not found then
    return false;
  end if;

  delete from public.drafts where tenant_id = p_tenant_id;
  delete from public.alerts where tenant_id = p_tenant_id;
  delete from public.notifications where tenant_id = p_tenant_id;
  delete from public.leads where tenant_id = p_tenant_id;
  delete from public.inbound_items where tenant_id = p_tenant_id;
  delete from public.conversations where tenant_id = p_tenant_id;
  delete from public.post_metrics where tenant_id = p_tenant_id;
  delete from public.posts where tenant_id = p_tenant_id;
  delete from public.analytics_snapshots where tenant_id = p_tenant_id;
  delete from public.kb_suggestions where tenant_id = p_tenant_id;
  delete from public.kb_entries where tenant_id = p_tenant_id;
  delete from public.lab_runs where tenant_id = p_tenant_id;
  delete from public.lab_cases where tenant_id = p_tenant_id;
  delete from public.autonomy_settings where tenant_id = p_tenant_id;
  delete from public.feature_flags where tenant_id = p_tenant_id;
  delete from public.mcp_calls where tenant_id = p_tenant_id;
  delete from public.social_accounts where tenant_id = p_tenant_id;
  delete from public.tenant_members where tenant_id = p_tenant_id;
  update public.mcp_grants set tenant_ids = array_remove(tenant_ids, p_tenant_id)
  where p_tenant_id = any (tenant_ids);

  -- Audit details hold ids and decisions; drop the two keys that can carry free text.
  update public.audit_log set details = details - 'groundingIssues' - 'note'
  where tenant_id = p_tenant_id and (details ? 'groundingIssues' or details ? 'note');

  update public.tenants
  set business_profile = '', zernio_profile_id = null, purged_at = now(), offboard_issue = null
  where id = p_tenant_id;
  insert into public.audit_log (tenant_id, action, actor, details)
    values (p_tenant_id, 'brand_purged', 'system', '{}'::jsonb);
  return true;
end;
$$;

revoke all on function public.offboard_tenant(uuid, uuid) from public, anon, authenticated;
revoke all on function public.restore_tenant(uuid, uuid) from public, anon, authenticated;
revoke all on function public.purge_tenant(uuid) from public, anon, authenticated;
grant execute on function public.offboard_tenant(uuid, uuid) to service_role;
grant execute on function public.restore_tenant(uuid, uuid) to service_role;
grant execute on function public.purge_tenant(uuid) to service_role;

-- Only admins offboard and restore.
insert into public.staff_role_permissions (role, permission) values ('admin', 'brands.manage');
