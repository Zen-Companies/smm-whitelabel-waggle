-- Brands (T47): one login can own several tenants. A tenant stays one business with its own
-- accounts, Business info, inbox, rules and bill; nothing is shared between them.

-- Pass 1 allowed one owned tenant per user. Brands lift that.
drop index public.tenant_members_one_tenant_per_owner;

-- Signup and login still return the owner's first tenant, created once (the original brand).
create or replace function public.create_owner_tenant(p_user_id uuid, p_name text)
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
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = p_user_id and m.role = 'owner'
  order by t.created_at, t.id
  limit 1;

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

-- Add a brand: a new tenant owned by the user. A brand with the same name (ignoring case and
-- outer spaces) is returned instead, with created = false, so a double submit makes one brand.
create function public.create_brand(p_user_id uuid, p_name text)
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

revoke all on function public.create_brand(uuid, text) from public, anon, authenticated;
grant execute on function public.create_brand(uuid, text) to service_role;
