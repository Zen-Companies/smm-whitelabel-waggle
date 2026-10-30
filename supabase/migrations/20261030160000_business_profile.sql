-- T25 (docs/tdd.md §19): a short owner-written description of the business (what they sell, how
-- people buy, their terms). The classifiers get it instead of the bare name; categories and
-- questions stay the same for every tenant. Treated as data: capped, and its timestamp is
-- recorded with each classification.
alter table public.tenants
  add column business_profile text not null default ''
    check (char_length(business_profile) <= 1000),
  add column business_profile_updated_at timestamptz;

create function private.touch_business_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_profile is distinct from old.business_profile then
    new.business_profile_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger tenants_touch_business_profile
  before update of business_profile on public.tenants
  for each row execute function private.touch_business_profile();

-- Owners edit it in Settings → Business (RLS: their own tenant only).
grant update (business_profile) on public.tenants to authenticated;
