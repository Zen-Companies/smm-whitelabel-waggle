-- T53 Organizations (docs/orgs/PLAN.md). An organization holds brands (tenants), members with a
-- role, invites and, later, the bill. Every login gets a personal organization.
--
-- tenant_members stays the effective access list (who can see which brand, with which role):
-- RLS, MCP grants, alerts and offboarding keep reading it. It is rebuilt from organization
-- membership by private.sync_org_access(), which every organization function calls.

-- ── Tables ──────────────────────────────────────────────────────────────────────────────────

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- The login this is the personal organization of (one each). Null for any other organization.
  personal_of uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  picture_path text,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null
);
create unique index organizations_one_personal_per_user on public.organizations (personal_of)
  where personal_of is not null;

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  -- false: only the brands listed in organization_member_brands ("only these brands").
  all_brands boolean not null default true,
  invited_by uuid references auth.users (id) on delete set null,
  primary key (organization_id, user_id),
  constraint owners_see_every_brand check (role <> 'owner' or all_brands)
);
create index organization_members_user_id_idx on public.organization_members (user_id);

create table public.organization_member_brands (
  organization_id uuid not null,
  user_id uuid not null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  primary key (organization_id, user_id, tenant_id),
  foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id) on delete cascade
);
create index organization_member_brands_tenant_id_idx on public.organization_member_brands (tenant_id);

-- Invites wait on the email address, so they work for an address with no login yet.
create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role text not null check (role in ('admin', 'member', 'viewer')),
  all_brands boolean not null default true,
  tenant_ids uuid[] not null default '{}',
  -- sha256 of the link's token, hex. The token itself is only ever in the email.
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  declined_at timestamptz,
  cancelled_at timestamptz,
  constraint some_brands_named check (all_brands or cardinality(tenant_ids) > 0)
);
-- One open invite per address and organization; resending refreshes it.
create unique index organization_invites_one_open on public.organization_invites (organization_id, email)
  where accepted_at is null and declined_at is null and cancelled_at is null;
create index organization_invites_email_idx on public.organization_invites (email);

-- Organization-level history (rule 11). Brand-level actions stay in audit_log.
create table public.organization_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  action text not null,
  actor text not null,
  details jsonb not null default '{}'::jsonb
);
create index organization_audit_org_created_idx on public.organization_audit (organization_id, created_at desc);

alter table public.tenants add column organization_id uuid references public.organizations (id);
create index tenants_organization_id_idx on public.tenants (organization_id);

alter table public.tenant_members drop constraint tenant_members_role_check;
alter table public.tenant_members add constraint tenant_members_role_check
  check (role in ('owner', 'admin', 'member', 'viewer'));

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────

create function private.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and o.closed_at is null;
$$;

-- Organizations where the signed-in user can manage the team (owner or admin).
create function private.user_team_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and o.closed_at is null and m.role in ('owner', 'admin');
$$;
revoke all on function private.user_org_ids() from public;
revoke all on function private.user_team_org_ids() from public;
grant execute on function private.user_org_ids() to authenticated;
grant execute on function private.user_team_org_ids() to authenticated;

create function private.org_role(p_org uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.organization_id = p_org and m.user_id = p_user;
$$;

-- Raises a coded error the app maps to copy: the message is the code.
create function private.fail(p_code text)
returns void
language plpgsql
as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end;
$$;

-- "Febron Sedoriosa" → "Febron's Organization". Name from sign-up metadata, else the email.
create function private.personal_org_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(split_part(btrim(coalesce(u.raw_user_meta_data ->> 'full_name',
                                     u.raw_user_meta_data ->> 'name', '')), ' ', 1), ''),
    nullif(initcap(split_part(split_part(coalesce(u.email, ''), '@', 1), '.', 1)), ''),
    'My'
  ) || '''s Organization'
  from auth.users u where u.id = p_user;
$$;

-- Rebuilds tenant_members for one organization: every member gets a row per brand they can
-- see (all, or the ones picked), with their role. Purged brands get none.
create function private.sync_org_access(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.tenant_members tm
  using public.tenants t
  where tm.tenant_id = t.id and t.organization_id = p_org
    and not exists (
      select 1 from public.organization_members m
      where m.organization_id = p_org and m.user_id = tm.user_id and t.purged_at is null
        and (m.all_brands or exists (
          select 1 from public.organization_member_brands b
          where b.organization_id = p_org and b.user_id = m.user_id and b.tenant_id = t.id)));

  insert into public.tenant_members (tenant_id, user_id, role)
  select t.id, m.user_id, m.role
  from public.organization_members m
  join public.tenants t on t.organization_id = m.organization_id
  where m.organization_id = p_org and t.purged_at is null
    and (m.all_brands or exists (
      select 1 from public.organization_member_brands b
      where b.organization_id = p_org and b.user_id = m.user_id and b.tenant_id = t.id))
  on conflict (tenant_id, user_id) do update set role = excluded.role
  where public.tenant_members.role is distinct from excluded.role;
end;
$$;

create function private.ensure_personal_org(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('personal_org:' || p_user::text, 0));
  select id into v_org from public.organizations where personal_of = p_user;
  if v_org is not null then
    return v_org;
  end if;
  insert into public.organizations (name, personal_of, created_by)
    values (coalesce(private.personal_org_name(p_user), 'My Organization'), p_user, p_user)
    returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role, all_brands)
    values (v_org, p_user, 'owner', true);
  insert into public.organization_audit (organization_id, action, actor, details)
    values (v_org, 'organization_created', p_user::text, '{"personal": true}'::jsonb);
  return v_org;
end;
$$;

-- Never leave an organization without an owner.
create function private.assert_other_owner(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_org and role = 'owner' and user_id <> p_user
  ) then
    perform private.fail('last_owner');
  end if;
end;
$$;

-- A direct insert into tenant_members (seed data, tests, scripts/local-owner, old code paths)
-- becomes organization membership, so the next sync keeps it: a brand with no organization
-- joins the user's personal one; a user outside the brand's organization gets that one brand.
create function private.tenant_member_to_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_all boolean;
begin
  select organization_id into v_org from public.tenants where id = new.tenant_id for update;
  if v_org is null then
    v_org := private.ensure_personal_org(new.user_id);
    update public.tenants set organization_id = v_org where id = new.tenant_id;
    return new;
  end if;
  select all_brands into v_all from public.organization_members
  where organization_id = v_org and user_id = new.user_id;
  if not found then
    insert into public.organization_members (organization_id, user_id, role, all_brands)
      values (v_org, new.user_id, new.role, new.role = 'owner');
    v_all := new.role = 'owner';
  end if;
  if not v_all then
    insert into public.organization_member_brands (organization_id, user_id, tenant_id)
      values (v_org, new.user_id, new.tenant_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger tenant_members_to_org after insert on public.tenant_members
  for each row execute function private.tenant_member_to_org();

-- A purged brand leaves every "only these brands" list and open invite.
create function private.forget_purged_brand()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.organization_member_brands where tenant_id = new.id;
  update public.organization_invites set tenant_ids = array_remove(tenant_ids, new.id)
  where new.id = any (tenant_ids);
  return new;
end;
$$;
create trigger tenants_forget_purged after update of purged_at on public.tenants
  for each row when (old.purged_at is null and new.purged_at is not null)
  execute function private.forget_purged_brand();

-- ── Backfill: one personal organization per owner, holding the brands they own ─────────────

do $$
declare
  r record;
  v_org uuid;
begin
  for r in
    select distinct on (t.id) t.id as tenant_id, m.user_id
    from public.tenants t
    join public.tenant_members m on m.tenant_id = t.id
    where t.organization_id is null
    order by t.id, (m.role = 'owner') desc, m.created_at
  loop
    v_org := private.ensure_personal_org(r.user_id);
    update public.tenants set organization_id = v_org where id = r.tenant_id;
  end loop;
  -- Anyone else on those brands (none today) keeps just that brand.
  insert into public.organization_members (organization_id, user_id, role, all_brands)
  select distinct on (t.organization_id, m.user_id) t.organization_id, m.user_id, m.role, m.role = 'owner'
  from public.tenant_members m join public.tenants t on t.id = m.tenant_id
  where t.organization_id is not null
  on conflict do nothing;
  insert into public.organization_member_brands (organization_id, user_id, tenant_id)
  select t.organization_id, m.user_id, m.tenant_id
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  join public.organization_members om
    on om.organization_id = t.organization_id and om.user_id = m.user_id and not om.all_brands
  on conflict do nothing;
  for v_org in select id from public.organizations loop
    perform private.sync_org_access(v_org);
  end loop;
end;
$$;

-- ── Server functions (service role only; each checks the actor itself) ─────────────────────

create function public.create_personal_org(p_user uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.ensure_personal_org(p_user);
$$;

create function public.create_organization(p_user uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_org uuid;
begin
  if v_name = '' or char_length(v_name) > 100 then
    perform private.fail('name_required');
  end if;
  insert into public.organizations (name, created_by) values (v_name, p_user) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role, all_brands)
    values (v_org, p_user, 'owner', true);
  insert into public.organization_audit (organization_id, action, actor, details)
    values (v_org, 'organization_created', p_user::text, '{}'::jsonb);
  return v_org;
end;
$$;

create function public.rename_organization(p_org uuid, p_actor uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_old text;
begin
  if coalesce(private.org_role(p_org, p_actor), '') not in ('owner', 'admin') then
    perform private.fail('not_allowed');
  end if;
  if v_name = '' or char_length(v_name) > 100 then
    perform private.fail('name_required');
  end if;
  select name into v_old from public.organizations where id = p_org and closed_at is null;
  if v_old is null then
    perform private.fail('not_found');
  end if;
  if v_old = v_name then
    return;
  end if;
  update public.organizations set name = v_name where id = p_org;
  insert into public.organization_audit (organization_id, action, actor, details)
    values (p_org, 'organization_renamed', p_actor::text, '{}'::jsonb);
end;
$$;

-- A new brand in an organization (owners and admins). Same name (ignoring case and outer
-- spaces) as an open brand there returns that one with created = false.
create function public.create_brand_in_org(p_org uuid, p_actor uuid, p_name text)
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
  if coalesce(private.org_role(p_org, p_actor), '') not in ('owner', 'admin') then
    perform private.fail('not_allowed');
  end if;
  perform 1 from public.organizations where id = p_org and closed_at is null for update;
  if not found then
    perform private.fail('not_found');
  end if;

  select t.id into v_tenant_id from public.tenants t
  where t.organization_id = p_org and lower(btrim(t.name)) = lower(v_name) and t.offboarded_at is null
  limit 1;
  if v_tenant_id is not null then
    return query select v_tenant_id, false;
    return;
  end if;

  insert into public.tenants (name, organization_id) values (v_name, p_org) returning id into v_tenant_id;
  perform private.sync_org_access(p_org);
  -- The creator sees it even when limited to some brands.
  if not exists (select 1 from public.tenant_members m where m.tenant_id = v_tenant_id and m.user_id = p_actor) then
    insert into public.organization_member_brands (organization_id, user_id, tenant_id)
      values (p_org, p_actor, v_tenant_id);
    perform private.sync_org_access(p_org);
  end if;
  insert into public.audit_log (tenant_id, action, actor, details)
    values (v_tenant_id, 'tenant_created', p_actor::text,
            jsonb_build_object('via', 'add_brand', 'organizationId', p_org));
  return query select v_tenant_id, true;
end;
$$;

-- Old callers (until T54 moves them): a brand in the user's personal organization.
create or replace function public.create_brand(p_user_id uuid, p_name text)
returns table (tenant_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public.create_brand_in_org(private.ensure_personal_org(p_user_id), p_user_id, p_name);
end;
$$;

-- Invite (owners and admins). Re-inviting an address with an open invite refreshes it (new
-- link, 7 more days, new role and brands). Returns status 'sent', 'refreshed' or
-- 'already_member' (nothing changed).
create function public.invite_member(
  p_org uuid, p_actor uuid, p_email text, p_role text, p_all_brands boolean,
  p_tenant_ids uuid[], p_token_hash text
)
returns table (invite_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_ids uuid[] := case when p_all_brands then '{}'::uuid[] else coalesce(p_tenant_ids, '{}') end;
  v_id uuid;
begin
  if coalesce(private.org_role(p_org, p_actor), '') not in ('owner', 'admin') then
    perform private.fail('not_allowed');
  end if;
  if p_role not in ('admin', 'member', 'viewer') then
    perform private.fail('bad_role');
  end if;
  if not p_all_brands and (cardinality(v_ids) = 0 or exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from public.tenants t
                      where t.id = x.id and t.organization_id = p_org and t.offboarded_at is null))) then
    perform private.fail('bad_brands');
  end if;
  perform 1 from public.organizations where id = p_org and closed_at is null;
  if not found then
    perform private.fail('not_found');
  end if;

  if exists (select 1 from public.organization_members m join auth.users u on u.id = m.user_id
             where m.organization_id = p_org and lower(u.email) = v_email) then
    return query select null::uuid, 'already_member'::text;
    return;
  end if;

  update public.organization_invites
  set role = p_role, all_brands = p_all_brands, tenant_ids = v_ids, token_hash = p_token_hash,
      invited_by = p_actor, expires_at = now() + interval '7 days', created_at = now()
  where organization_id = p_org and email = v_email
    and accepted_at is null and declined_at is null and cancelled_at is null
  returning id into v_id;
  if v_id is not null then
    insert into public.organization_audit (organization_id, action, actor, details)
      values (p_org, 'invite_resent', p_actor::text, jsonb_build_object('inviteId', v_id, 'role', p_role));
    return query select v_id, 'refreshed'::text;
    return;
  end if;

  insert into public.organization_invites
    (organization_id, email, role, all_brands, tenant_ids, token_hash, invited_by)
    values (p_org, v_email, p_role, p_all_brands, v_ids, p_token_hash, p_actor)
    returning id into v_id;
  insert into public.organization_audit (organization_id, action, actor, details)
    values (p_org, 'invite_sent', p_actor::text, jsonb_build_object('inviteId', v_id, 'role', p_role));
  return query select v_id, 'sent'::text;
end;
$$;

-- Resend an expired or open invite with a new link (owners and admins).
create function public.resend_invite(p_invite uuid, p_actor uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_invites
  where id = p_invite and accepted_at is null and declined_at is null and cancelled_at is null;
  if v_org is null then
    return false;
  end if;
  if coalesce(private.org_role(v_org, p_actor), '') not in ('owner', 'admin') then
    perform private.fail('not_allowed');
  end if;
  update public.organization_invites
  set token_hash = p_token_hash, expires_at = now() + interval '7 days', invited_by = p_actor
  where id = p_invite;
  insert into public.organization_audit (organization_id, action, actor, details)
    values (v_org, 'invite_resent', p_actor::text, jsonb_build_object('inviteId', p_invite));
  return true;
end;
$$;

create function public.cancel_invite(p_invite uuid, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_invites
  where id = p_invite and accepted_at is null and declined_at is null and cancelled_at is null;
  if v_org is null then
    return false;
  end if;
  if coalesce(private.org_role(v_org, p_actor), '') not in ('owner', 'admin') then
    perform private.fail('not_allowed');
  end if;
  update public.organization_invites set cancelled_at = now() where id = p_invite;
  insert into public.organization_audit (organization_id, action, actor, details)
    values (v_org, 'invite_cancelled', p_actor::text, jsonb_build_object('inviteId', p_invite));
  return true;
end;
$$;

-- What an invite link shows, before anyone acts on it. Status: 'open', 'expired', 'cancelled',
-- 'declined', 'accepted', 'closed' (organization closed) or 'not_found'.
create function public.invite_by_token(p_token_hash text)
returns table (
  invite_id uuid, status text, organization_id uuid, organization_name text, email text,
  role text, all_brands boolean, tenant_ids uuid[], invited_by uuid, expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         case when i.accepted_at is not null then 'accepted'
              when i.cancelled_at is not null then 'cancelled'
              when i.declined_at is not null then 'declined'
              when o.closed_at is not null then 'closed'
              when i.expires_at <= now() then 'expired'
              else 'open' end,
         o.id, o.name, i.email, i.role, i.all_brands, i.tenant_ids, i.invited_by, i.expires_at
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = p_token_hash;
$$;

-- Accept as p_user. Status: 'joined', 'already_member', 'wrong_email', or the invite_by_token
-- status when it isn't open.
create function public.accept_invite(p_token_hash text, p_user uuid)
returns table (organization_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.organization_invites%rowtype;
  v_status text;
  v_email text;
begin
  select * into v from public.organization_invites where token_hash = p_token_hash for update;
  if not found then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;
  select i.status into v_status from public.invite_by_token(p_token_hash) i;
  if v_status = 'accepted' and v.accepted_by = p_user then
    return query select v.organization_id, 'already_member'::text;
    return;
  end if;
  if v_status <> 'open' then
    return query select v.organization_id, v_status;
    return;
  end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is distinct from v.email then
    return query select v.organization_id, 'wrong_email'::text;
    return;
  end if;

  update public.organization_invites set accepted_at = now(), accepted_by = p_user where id = v.id;
  if exists (select 1 from public.organization_members m
             where m.organization_id = v.organization_id and m.user_id = p_user) then
    return query select v.organization_id, 'already_member'::text;
    return;
  end if;
  insert into public.organization_members (organization_id, user_id, role, all_brands, invited_by)
    values (v.organization_id, p_user, v.role, v.all_brands, v.invited_by);
  if not v.all_brands then
    insert into public.organization_member_brands (organization_id, user_id, tenant_id)
    select v.organization_id, p_user, t.id from public.tenants t
    where t.id = any (v.tenant_ids) and t.organization_id = v.organization_id;
  end if;
  perform private.sync_org_access(v.organization_id);
  insert into public.organization_audit (organization_id, action, actor, details)
    values (v.organization_id, 'member_joined', p_user::text,
            jsonb_build_object('inviteId', v.id, 'role', v.role));
  return query select v.organization_id, 'joined'::text;
end;
$$;

create function public.decline_invite(p_token_hash text, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.organization_invites%rowtype;
  v_status text;
begin
  select * into v from public.organization_invites where token_hash = p_token_hash for update;
  if not found then
    return 'not_found';
  end if;
  select i.status into v_status from public.invite_by_token(p_token_hash) i;
  if v_status <> 'open' then
    return v_status;
  end if;
  if (select lower(email) from auth.users where id = p_user) is distinct from v.email then
    return 'wrong_email';
  end if;
  update public.organization_invites set declined_at = now() where id = v.id;
  insert into public.organization_audit (organization_id, action, actor, details)
    values (v.organization_id, 'invite_declined', p_user::text, jsonb_build_object('inviteId', v.id));
  return 'declined';
end;
$$;

-- Owners change anyone's role; admins change admins, members and viewers, and never make an
-- owner. Nobody changes their own role. The last owner can't be demoted.
create function public.set_member_role(p_org uuid, p_actor uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.org_role(p_org, p_actor);
  v_target text := private.org_role(p_org, p_user);
begin
  if p_role not in ('owner', 'admin', 'member', 'viewer') then
    perform private.fail('bad_role');
  end if;
  if v_target is null then
    perform private.fail('not_found');
  end if;
  if p_actor = p_user or coalesce(v_actor, '') not in ('owner', 'admin')
     or (v_actor = 'admin' and (v_target = 'owner' or p_role = 'owner')) then
    perform private.fail('not_allowed');
  end if;
  if v_target = p_role then
    return;
  end if;
  if v_target = 'owner' then
    perform private.assert_other_owner(p_org, p_user);
  end if;
  update public.organization_members
  set role = p_role, all_brands = all_brands or p_role = 'owner'
  where organization_id = p_org and user_id = p_user;
  if p_role = 'owner' then
    delete from public.organization_member_brands where organization_id = p_org and user_id = p_user;
  end if;
  perform private.sync_org_access(p_org);
  insert into public.organization_audit (organization_id, action, actor, details)
    values (p_org, 'member_role_changed', p_actor::text,
            jsonb_build_object('userId', p_user, 'from', v_target, 'to', p_role));
end;
$$;

-- All brands, or only the ones listed (owners always see all).
create function public.set_member_brands(
  p_org uuid, p_actor uuid, p_user uuid, p_all_brands boolean, p_tenant_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.org_role(p_org, p_actor);
  v_target text := private.org_role(p_org, p_user);
begin
  if v_target is null then
    perform private.fail('not_found');
  end if;
  if coalesce(v_actor, '') not in ('owner', 'admin') or v_target = 'owner' or p_actor = p_user then
    perform private.fail('not_allowed');
  end if;
  if not p_all_brands and (cardinality(coalesce(p_tenant_ids, '{}')) = 0 or exists (
    select 1 from unnest(p_tenant_ids) x(id)
    where not exists (select 1 from public.tenants t
                      where t.id = x.id and t.organization_id = p_org and t.purged_at is null))) then
    perform private.fail('bad_brands');
  end if;
  update public.organization_members set all_brands = p_all_brands
  where organization_id = p_org and user_id = p_user;
  delete from public.organization_member_brands where organization_id = p_org and user_id = p_user;
  if not p_all_brands then
    insert into public.organization_member_brands (organization_id, user_id, tenant_id)
    select distinct p_org, p_user, x.id from unnest(p_tenant_ids) x(id);
  end if;
  perform private.sync_org_access(p_org);
  insert into public.organization_audit (organization_id, action, actor, details)
    values (p_org, 'member_brands_changed', p_actor::text,
            jsonb_build_object('userId', p_user, 'allBrands', p_all_brands,
                               'tenantIds', case when p_all_brands then '[]'::jsonb else to_jsonb(p_tenant_ids) end));
end;
$$;

create function public.remove_member(p_org uuid, p_actor uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.org_role(p_org, p_actor);
  v_target text := private.org_role(p_org, p_user);
begin
  if v_target is null then
    perform private.fail('not_found');
  end if;
  if p_actor = p_user or coalesce(v_actor, '') not in ('owner', 'admin')
     or (v_actor = 'admin' and v_target = 'owner') then
    perform private.fail('not_allowed');
  end if;
  if v_target = 'owner' then
    perform private.assert_other_owner(p_org, p_user);
  end if;
  delete from public.organization_members where organization_id = p_org and user_id = p_user;
  perform private.sync_org_access(p_org);
  insert into public.organization_audit (organization_id, action, actor, details)
    values (p_org, 'member_removed', p_actor::text, jsonb_build_object('userId', p_user, 'role', v_target));
end;
$$;

create function public.leave_organization(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.org_role(p_org, p_user);
begin
  if v_role is null then
    perform private.fail('not_found');
  end if;
  if v_role = 'owner' then
    perform private.assert_other_owner(p_org, p_user);
  end if;
  delete from public.organization_members where organization_id = p_org and user_id = p_user;
  perform private.sync_org_access(p_org);
  insert into public.organization_audit (organization_id, action, actor, details)
    values (p_org, 'member_left', p_user::text, jsonb_build_object('role', v_role));
end;
$$;

-- Owners only. Offboards every open brand (T21: 3 months to restore) and closes the organization.
create function public.close_organization(p_org uuid, p_actor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_count integer := 0;
begin
  if coalesce(private.org_role(p_org, p_actor), '') <> 'owner' then
    perform private.fail('not_allowed');
  end if;
  update public.organizations set closed_at = now(), closed_by = p_actor
  where id = p_org and closed_at is null;
  if not found then
    perform private.fail('not_found');
  end if;
  for v_tenant in select id from public.tenants where organization_id = p_org and offboarded_at is null loop
    perform public.offboard_tenant(v_tenant, p_actor);
    v_count := v_count + 1;
  end loop;
  update public.organization_invites set cancelled_at = now()
  where organization_id = p_org and accepted_at is null and declined_at is null and cancelled_at is null;
  insert into public.organization_audit (organization_id, action, actor, details)
    values (p_org, 'organization_closed', p_actor::text, jsonb_build_object('brands', v_count));
  return v_count;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_personal_org(uuid)',
    'public.create_organization(uuid, text)',
    'public.rename_organization(uuid, uuid, text)',
    'public.create_brand_in_org(uuid, uuid, text)',
    'public.invite_member(uuid, uuid, text, text, boolean, uuid[], text)',
    'public.resend_invite(uuid, uuid, text)',
    'public.cancel_invite(uuid, uuid)',
    'public.invite_by_token(text)',
    'public.accept_invite(text, uuid)',
    'public.decline_invite(text, uuid)',
    'public.set_member_role(uuid, uuid, uuid, text)',
    'public.set_member_brands(uuid, uuid, uuid, boolean, uuid[])',
    'public.remove_member(uuid, uuid, uuid)',
    'public.leave_organization(uuid, uuid)',
    'public.close_organization(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
revoke all on function private.org_role(uuid, uuid) from public;
revoke all on function private.sync_org_access(uuid) from public;
revoke all on function private.ensure_personal_org(uuid) from public;
revoke all on function private.personal_org_name(uuid) from public;
revoke all on function private.assert_other_owner(uuid, uuid) from public;

-- ── RLS: members read their organizations; every write goes through the functions above ─────

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_member_brands enable row level security;
alter table public.organization_invites enable row level security;
alter table public.organization_audit enable row level security;

grant select on public.organizations, public.organization_members,
  public.organization_member_brands to authenticated;
grant select (id, created_at, organization_id, email, role, all_brands, tenant_ids, invited_by,
              expires_at, accepted_at, declined_at, cancelled_at)
  on public.organization_invites to authenticated;
grant select on public.organization_audit to authenticated;

create policy "members read their organizations" on public.organizations
  for select to authenticated using (id in (select private.user_org_ids()));
create policy "members read their organization's members" on public.organization_members
  for select to authenticated using (organization_id in (select private.user_org_ids()));
create policy "members read their organization's brand limits" on public.organization_member_brands
  for select to authenticated using (organization_id in (select private.user_org_ids()));
create policy "owners and admins read invites" on public.organization_invites
  for select to authenticated using (organization_id in (select private.user_team_org_ids()));
create policy "owners and admins read the organization history" on public.organization_audit
  for select to authenticated using (organization_id in (select private.user_team_org_ids()));

grant all on public.organizations, public.organization_members, public.organization_member_brands,
  public.organization_invites, public.organization_audit to service_role;
