-- Connect fix 2 (approved 24 Nov): a one-time sign-in link, so moving from Instagram's or
-- Facebook's own browser to Safari or Chrome (or scanning the desktop QR code) keeps the person
-- signed in and lands them on the same setup screen. The sign-in itself is Supabase's magic-link
-- token (admin generateLink, verified with verifyOtp); this row only limits the link to 10
-- minutes, one use and one user. The token is never stored here. Additive only. Service role
-- only: no grants to anon or authenticated, RLS on with no policies.

create table public.signin_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  -- Where it lands: a setup path checked by the app (signinLinkNext).
  next text not null check (char_length(next) between 1 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index signin_links_user_created_idx on public.signin_links (user_id, created_at desc);

alter table public.signin_links enable row level security;
revoke all on public.signin_links from anon, authenticated;
grant all on public.signin_links to service_role;
create policy "no oauth clients" on public.signin_links as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
