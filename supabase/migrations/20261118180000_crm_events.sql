-- Waggle → GoHighLevel (docs/ghl-plan.md, decided 18 Nov). Lifecycle events for an organization's
-- owner wait here until the jobs route sends them to HighLevel: contact fields, then the trigger
-- tag `waggle-app-event`. Oldest first per contact, at least 30 s apart (Walter's API path).
-- Server-only: written by the app (Stripe webhook included, rule 3) and read by the jobs route.

create table public.crm_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid references public.organizations (id) on delete cascade,
  -- The person the contact is: the organization's owner (or the one who acted).
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (event ~ '^[a-z][a-z0-9_]{1,40}$'),
  -- Event-only details (from_plan, platform, days_inactive …). Ids and names, never message text.
  details jsonb not null default '{}'::jsonb,
  -- One send per thing that happened (a retried Stripe event, a second click).
  dedupe_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  ghl_contact_id text,
  last_error text
);
create index crm_events_pending_idx on public.crm_events (user_id, created_at)
  where status = 'pending';

alter table public.crm_events enable row level security;
create policy "no oauth clients" on public.crm_events as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- When each login last used the app (inactive / app_active). Written at most once an hour.
create table public.user_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  -- Set when `inactive` was sent; cleared by the next visit (which sends `app_active`).
  inactive_sent_at timestamptz
);

alter table public.user_activity enable row level security;
create policy "no oauth clients" on public.user_activity as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
