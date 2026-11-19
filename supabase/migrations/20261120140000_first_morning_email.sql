-- First connect, "Next morning" (canvas board approved 20 Nov): once per organization, the morning
-- after its first account connected, one email when new customer messages came in overnight and
-- replies are drafted. Additive only.

-- One row per organization once it was decided: sent, or skipped (nothing new, the morning
-- passed). The row is the "never again" guard. Organization rows written only by the jobs route
-- (service role): RLS on, no policies, so the browser never reads it (like org_idle).
create table public.first_morning_emails (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  catch_up_id uuid references public.catch_ups (id) on delete set null,
  -- 'sending' while one run sends it (a crash leaves it: at most once, never twice).
  outcome text not null check (outcome in ('sending', 'sent', 'skipped')),
  reason text,
  messages integer,
  replies integer,
  sent_at timestamptz
);

alter table public.first_morning_emails enable row level security;
create policy "no oauth clients" on public.first_morning_emails as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- Emails a person turned off in Settings → Tell me when. 'check_in': the morning-after email.
-- A person's own choice (not a tenant setting: it covers every business they're in), saved with
-- their own client.
create table public.email_opt_outs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('check_in')),
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.email_opt_outs enable row level security;
create policy "no oauth clients" on public.email_opt_outs as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy "own opt-outs: read" on public.email_opt_outs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own opt-outs: add" on public.email_opt_outs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own opt-outs: remove" on public.email_opt_outs for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert (user_id, kind), delete on public.email_opt_outs to authenticated;
