-- Confirm later (hotfix, approved 21 Nov, canvas "Sign up without waiting for the email"). Additive.
--
-- With Supabase's "Confirm email" off, an email signup is logged in at once. Waggle sends its own
-- confirm link and keeps the state here; until it's confirmed, team invites and Waggle's emails to
-- that person wait. One row per email signup made after this release: no row means confirmed (Google
-- sign-ups and everyone from before). Only the hash of the link's token is stored. Written with the
-- service role only; a person can read their own row.

create table public.email_confirmations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  token_hash text not null,
  sent_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create unique index email_confirmations_token_hash on public.email_confirmations (token_hash);

alter table public.email_confirmations enable row level security;
create policy "no oauth clients" on public.email_confirmations as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

create policy "own email confirmation" on public.email_confirmations
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.email_confirmations to authenticated;
