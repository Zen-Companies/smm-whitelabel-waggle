-- Default autonomy settings for every new tenant (PRD F9):
-- faq = approve, lead = approve, complaint = off, spam = off, unclear = off.

create function private.create_default_autonomy_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.autonomy_settings (tenant_id, category, mode)
  values
    (new.id, 'faq', 'approve'),
    (new.id, 'lead', 'approve'),
    (new.id, 'complaint', 'off'),
    (new.id, 'spam', 'off'),
    (new.id, 'unclear', 'off')
  on conflict (tenant_id, category) do nothing;
  return new;
end;
$$;

create trigger tenants_create_default_autonomy_settings
  after insert on public.tenants
  for each row execute function private.create_default_autonomy_settings();
