-- Fix 1: record every connect (24 Nov). Jason's team saw 4 of 5 Meta connects vanish with no
-- trace: Zernio puts error, error_message, error_reason and is_user_fixable on the connect's return
-- URL (docs.zernio.com/guides/connecting-accounts, "If it fails"), Waggle showed them but never
-- kept them. One row per sign-in started; the return, the account arriving, or a sweep 2 hours
-- later closes it. Additive only. Written by the server with the service role; members of the
-- brand can read their own rows (an admin page reads them later).
--
-- error_message is Zernio's / Meta's explanation, not customer text (CLAUDE.md rule 10), and is
-- kept to 300 characters; user_agent to 400.

create table public.connect_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  platform text not null check (char_length(platform) between 1 and 40),
  -- How the sign-in was opened: 'here' (this tab), 'tab' (a new tab), 'form' (the Connect form).
  mode text check (char_length(mode) <= 20),
  started_at timestamptz not null default now(),
  returned_at timestamptz,
  outcome text check (outcome in ('connected', 'failed', 'returned_without_account', 'abandoned')),
  outcome_at timestamptz,
  error text check (char_length(error) <= 100),
  error_reason text check (char_length(error_reason) <= 100),
  error_message text check (char_length(error_message) <= 300),
  is_user_fixable boolean,
  -- Zernio's `stage` (authorize / callback / select_page) and `step` (headless pickers).
  stage text check (char_length(stage) <= 40),
  step text check (char_length(step) <= 40),
  platform_error text check (char_length(platform_error) <= 100),
  user_agent_class text check (user_agent_class in
    ('in_app_instagram', 'in_app_facebook', 'in_app_tiktok', 'mobile_browser', 'desktop_browser', 'other')),
  user_agent text check (char_length(user_agent) <= 400),
  -- Zernio's ids from the return URL, when sent.
  zernio_request_id text check (char_length(zernio_request_id) <= 100),
  zernio_account_id text check (char_length(zernio_account_id) <= 100),
  zernio_profile_id text check (char_length(zernio_profile_id) <= 100),
  connect_token text check (char_length(connect_token) <= 200)
);

-- The open attempt for a brand + platform (the return and the account arriving look it up).
create index connect_attempts_tenant_platform_idx
  on public.connect_attempts (tenant_id, platform, started_at desc);
-- The sweep: attempts with no outcome yet.
create index connect_attempts_open_idx
  on public.connect_attempts (started_at) where outcome is null;

alter table public.connect_attempts enable row level security;
grant select on public.connect_attempts to authenticated;
create policy "members read their tenant" on public.connect_attempts
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "no oauth clients" on public.connect_attempts as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- A purged brand's attempts go with it (T21), like its catch-ups.
create function private.forget_purged_connect_attempts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.connect_attempts where tenant_id = new.id;
  return new;
end;
$$;

create trigger tenants_forget_purged_connect_attempts after update of purged_at on public.tenants
  for each row when (old.purged_at is null and new.purged_at is not null)
  execute function private.forget_purged_connect_attempts();
