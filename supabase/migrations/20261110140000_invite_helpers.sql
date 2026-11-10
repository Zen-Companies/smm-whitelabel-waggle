-- T56 invites: what the Team page, the invite email and /welcome need from auth.users and the
-- invites, without exposing either to the Data API. Service role only.

-- Whether an address already has a Waggle login (the email then says "Join", not "Create your
-- login to join").
create function public.email_has_login(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(p_email)));
$$;

-- Open invites to this login's email (/welcome lists them with Join / Decline).
create function public.invites_for_user(p_user uuid)
returns table (
  invite_id uuid, organization_id uuid, organization_name text, role text, all_brands boolean,
  brand_names text[], invited_by uuid, expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, o.id, o.name, i.role, i.all_brands,
         coalesce((select array_agg(t.name order by t.name) from public.tenants t
                   where t.id = any (i.tenant_ids)), '{}'),
         i.invited_by, i.expires_at
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where i.email = (select lower(u.email) from auth.users u where u.id = p_user)
    and i.accepted_at is null and i.declined_at is null and i.cancelled_at is null
    and i.expires_at > now() and o.closed_at is null
    and not exists (select 1 from public.organization_members m
                    where m.organization_id = o.id and m.user_id = p_user)
  order by i.created_at;
$$;

-- Accept or decline from /welcome, where the user has no link: same checks as by token.
create function public.accept_invite_by_id(p_invite uuid, p_user uuid)
returns table (organization_id uuid, status text)
language sql
security definer
set search_path = ''
as $$
  select a.organization_id, a.status
  from public.organization_invites i, lateral public.accept_invite(i.token_hash, p_user) a
  where i.id = p_invite;
$$;

create function public.decline_invite_by_id(p_invite uuid, p_user uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select public.decline_invite(i.token_hash, p_user) from public.organization_invites i
  where i.id = p_invite;
$$;

-- The Team page: members with their email, name and last sign-in (owners and admins see all;
-- the app checks the role), and the brands limited members can see.
create function public.organization_team(p_org uuid)
returns table (
  user_id uuid, email text, full_name text, role text, all_brands boolean, tenant_ids uuid[],
  last_sign_in_at timestamptz, joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email, nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
         m.role, m.all_brands,
         coalesce((select array_agg(b.tenant_id) from public.organization_member_brands b
                   where b.organization_id = m.organization_id and b.user_id = m.user_id), '{}'),
         u.last_sign_in_at, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'member' then 2 else 3 end,
           m.created_at;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.email_has_login(text)',
    'public.invites_for_user(uuid)',
    'public.accept_invite_by_id(uuid, uuid)',
    'public.decline_invite_by_id(uuid, uuid)',
    'public.organization_team(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
