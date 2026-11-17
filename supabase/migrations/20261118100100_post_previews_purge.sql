-- A purged brand's post previews go with it (T21): deleted when purge_tenant sets purged_at,
-- like organization_member_brands (tenants_forget_purged).
create function private.forget_purged_previews()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_previews where tenant_id = new.id;
  return new;
end;
$$;

create trigger tenants_forget_purged_previews after update of purged_at on public.tenants
  for each row when (old.purged_at is null and new.purged_at is not null)
  execute function private.forget_purged_previews();
