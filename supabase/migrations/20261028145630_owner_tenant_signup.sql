-- Signup (docs/tasks.md T3): one tenant per owner, created exactly once even on retries.

-- Pass 1 has one owner per tenant and one tenant per owner (PRD §3).
create unique index tenant_members_one_tenant_per_owner
  on public.tenant_members (user_id) where role = 'owner';

-- Returns the owner's tenant, creating it (tenant + owner member + audit row) on the first call.
-- The advisory lock serializes concurrent signups of the same user; the unique index above is
-- the backstop. Service role only: called from server code after Supabase Auth signup.
create function public.create_owner_tenant(p_user_id uuid, p_name text)
returns table (tenant_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('owner_tenant:' || p_user_id::text, 0));

  select m.tenant_id into v_tenant_id
  from public.tenant_members m
  where m.user_id = p_user_id and m.role = 'owner';

  if v_tenant_id is not null then
    return query select v_tenant_id, false;
    return;
  end if;

  insert into public.tenants (name) values (p_name) returning id into v_tenant_id;
  insert into public.tenant_members (tenant_id, user_id, role)
    values (v_tenant_id, p_user_id, 'owner');
  insert into public.audit_log (tenant_id, action, actor, details)
    values (v_tenant_id, 'tenant_created', p_user_id::text, '{}'::jsonb);

  return query select v_tenant_id, true;
end;
$$;

revoke all on function public.create_owner_tenant(uuid, text) from public, anon, authenticated;
grant execute on function public.create_owner_tenant(uuid, text) to service_role;
