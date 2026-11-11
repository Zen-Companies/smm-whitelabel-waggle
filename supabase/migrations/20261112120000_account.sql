-- Settings → Account (docs/auth/AUDIT.md): what the page needs from auth.users and
-- auth.identities, and the checks before a login is deleted. Service role only.

-- Whether the login can sign in with a password (a Google-only login has none until it adds one).
create function public.login_has_password(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(u.encrypted_password, '') <> '' from auth.users u where u.id = p_user;
$$;

-- Disconnect Google, only while a password is set (so the login can always sign in).
create function public.disconnect_google(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.login_has_password(p_user) then
    return false;
  end if;
  delete from auth.identities where user_id = p_user and provider = 'google';
  return found;
end;
$$;

-- Organizations that stop a login from being deleted: ones where it is the only owner while
-- others are members, or (shared organizations) while it still has open brands.
create function public.login_deletion_blockers(p_user uuid)
returns table (organization_id uuid, organization_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = p_user and m.role = 'owner' and o.closed_at is null
    and not exists (select 1 from public.organization_members x
                    where x.organization_id = o.id and x.role = 'owner' and x.user_id <> p_user)
    and (exists (select 1 from public.organization_members x
                 where x.organization_id = o.id and x.user_id <> p_user)
         or (o.personal_of is null and exists (select 1 from public.tenants t
                                              where t.organization_id = o.id and t.offboarded_at is null)))
  order by o.name;
$$;

-- Before the login is deleted: its personal organization's brands are offboarded (3 months to
-- restore, as T21), an empty personal organization is removed, and it leaves every other
-- organization. Returns false (and changes nothing) while blockers remain.
create function public.prepare_login_deletion(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_tenant uuid;
begin
  if exists (select 1 from public.login_deletion_blockers(p_user)) then
    return false;
  end if;
  select id into v_org from public.organizations where personal_of = p_user;
  if v_org is not null then
    for v_tenant in select id from public.tenants where organization_id = v_org and offboarded_at is null loop
      perform public.offboard_tenant(v_tenant, p_user);
    end loop;
    if not exists (select 1 from public.tenants where organization_id = v_org) then
      delete from public.organizations where id = v_org;
    else
      update public.organizations set closed_at = now(), closed_by = p_user where id = v_org;
      insert into public.organization_audit (organization_id, action, actor, details)
        values (v_org, 'organization_closed', p_user::text, '{"via": "login_deleted"}'::jsonb);
    end if;
  end if;
  for v_org in select organization_id from public.organization_members where user_id = p_user loop
    delete from public.organization_members where organization_id = v_org and user_id = p_user;
    perform private.sync_org_access(v_org);
    insert into public.organization_audit (organization_id, action, actor, details)
      values (v_org, 'member_left', p_user::text, '{"via": "login_deleted"}'::jsonb);
  end loop;
  return true;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.login_has_password(uuid)',
    'public.disconnect_google(uuid)',
    'public.login_deletion_blockers(uuid)',
    'public.prepare_login_deletion(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
