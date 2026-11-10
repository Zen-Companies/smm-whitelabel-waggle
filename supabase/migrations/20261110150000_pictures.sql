-- T57 pictures (design v3 "Organizations", OrgPictures). An organization's picture is uploaded;
-- a brand's comes from a connected account (copied to our storage: platform links expire), an
-- upload, or none (initials). Files live in the public "pictures" bucket under unguessable
-- paths; only the server writes them.

alter table public.tenants
  add column picture_source text not null default 'account'
    check (picture_source in ('account', 'upload', 'none')),
  add column picture_path text,
  add column picture_account_id uuid references public.social_accounts (id) on delete set null;

alter table public.social_accounts
  add column picture_url text,
  add column picture_path text,
  add column picture_checked_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pictures', 'pictures', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- A purged brand keeps no picture.
create function private.purged_brand_drops_picture()
returns trigger
language plpgsql
as $$
begin
  new.picture_path := null;
  new.picture_source := 'none';
  new.picture_account_id := null;
  return new;
end;
$$;
create trigger tenants_purged_drop_picture before update of purged_at on public.tenants
  for each row when (old.purged_at is null and new.purged_at is not null)
  execute function private.purged_brand_drops_picture();

-- A personal organization can't be closed: every login keeps one (T54). Its brands can still be
-- offboarded one by one.
create or replace function public.close_organization(p_org uuid, p_actor uuid)
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
  if exists (select 1 from public.organizations where id = p_org and personal_of is not null) then
    perform private.fail('personal');
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
revoke all on function public.close_organization(uuid, uuid) from public, anon, authenticated;
grant execute on function public.close_organization(uuid, uuid) to service_role;
