-- Beta access (design v3 "Beta access and feedback"). While the global switch `beta.required` is
-- on (no row = on), a login needs a beta record to use Waggle. Records come from a code, from
-- being invited to a team, or from having existed before the gate. They are what future beta
-- perks are based on. Service role only.

create table public.beta_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  label text not null default '' check (char_length(label) <= 120),
  max_uses integer check (max_uses is null or max_uses >= 1),
  uses integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null
);

create table public.beta_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  via text not null check (via in ('code', 'invite', 'existing')),
  code_id uuid references public.beta_codes (id) on delete set null,
  invited_by uuid references auth.users (id) on delete set null,
  -- When the beta_joined event reached GHL (null: not sent; 'existing' logins are never sent).
  announced_at timestamptz
);
create index beta_access_code_id_idx on public.beta_access (code_id);

-- Wrong codes, for the 10-tries-per-15-minutes limit.
create table public.beta_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index beta_attempts_user_at_idx on public.beta_attempts (user_id, at desc);

alter table public.beta_codes enable row level security;
alter table public.beta_access enable row level security;
alter table public.beta_attempts enable row level security;
grant all on public.beta_codes, public.beta_access, public.beta_attempts to service_role;
do $$
declare
  t text;
begin
  foreach t in array array['beta_codes', 'beta_access', 'beta_attempts'] loop
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated, anon '
      'using ((select auth.jwt() ->> ''client_id'') is null) '
      'with check ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end
$$;

-- Every login that exists now is a beta user (source "existing").
insert into public.beta_access (user_id, via, joined_at)
select id, 'existing', created_at from auth.users
on conflict do nothing;

-- Joining a team through an invite counts as beta access (source "invite", with the inviter).
create function private.beta_from_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invited_by is not null then
    insert into public.beta_access (user_id, via, invited_by)
      values (new.user_id, 'invite', new.invited_by)
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger organization_members_beta after insert on public.organization_members
  for each row execute function private.beta_from_invite();

-- Redeem a code. Status: 'ok', 'already' (has access), 'not_found', 'used_up', 'expired', 'off',
-- 'too_many' (10 wrong tries in 15 minutes).
create function public.redeem_beta_code(p_user uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.beta_codes%rowtype;
  v_code text := upper(btrim(p_code));
begin
  if exists (select 1 from public.beta_access where user_id = p_user) then
    return 'already';
  end if;
  if (select count(*) from public.beta_attempts
      where user_id = p_user and at > now() - interval '15 minutes') >= 10 then
    return 'too_many';
  end if;
  select * into v from public.beta_codes where code = v_code for update;
  if not found then
    insert into public.beta_attempts (user_id) values (p_user);
    return 'not_found';
  end if;
  if not v.active then
    insert into public.beta_attempts (user_id) values (p_user);
    return 'off';
  end if;
  if v.expires_at is not null and v.expires_at <= now() then
    insert into public.beta_attempts (user_id) values (p_user);
    return 'expired';
  end if;
  if v.max_uses is not null and v.uses >= v.max_uses then
    insert into public.beta_attempts (user_id) values (p_user);
    return 'used_up';
  end if;
  update public.beta_codes set uses = uses + 1 where id = v.id;
  insert into public.beta_access (user_id, via, code_id) values (p_user, 'code', v.id);
  return 'ok';
end;
$$;
revoke all on function public.redeem_beta_code(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_beta_code(uuid, text) to service_role;

-- Staff: admins manage beta codes.
insert into public.staff_role_permissions (role, permission) values ('admin', 'beta.manage')
on conflict do nothing;
