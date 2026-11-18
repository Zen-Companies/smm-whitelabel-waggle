-- Waggle emails (design "Waggle emails: branded, one summary per sender", approved 18 Nov).
-- Each person picks how often Waggle emails them: right away, every hour or every 2 hours. Staff
-- set the default for everyone who hasn't picked. Batched alerts wait in alert_digest_entries
-- until that person's summary goes out.

-- Site-wide default (one row). Server-only: staff change it through the app.
create table public.email_settings (
  id boolean primary key default true check (id),
  default_frequency text not null default 'hourly'
    check (default_frequency in ('now', 'hourly', 'two_hours')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.email_settings (id) values (true);

alter table public.email_settings enable row level security;
create policy "no oauth clients" on public.email_settings as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- Who changed the default, from what to what (CLAUDE.md rule 11).
create table public.email_settings_changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  before text,
  after text not null
);

alter table public.email_settings_changes enable row level security;
create policy "no oauth clients" on public.email_settings_changes as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- A person's own choice (not a tenant setting: it covers every business they're in).
create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_frequency text not null check (email_frequency in ('now', 'hourly', 'two_hours')),
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
create policy "no oauth clients" on public.notification_prefs as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy "own prefs: read" on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own prefs: add" on public.notification_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own prefs: change" on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- An alert waiting for one person's summary. `content` holds names, places and reason codes,
-- never message text (rule 10). Server-only.
create table public.alert_digest_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  alert_id uuid not null references public.alerts (id) on delete cascade,
  content jsonb not null,
  -- Claimed by one run while its summary is sent; a stale claim is taken again.
  claimed_at timestamptz,
  sent_at timestamptz,
  unique (user_id, alert_id)
);
create index alert_digest_entries_unsent_idx
  on public.alert_digest_entries (created_at) where sent_at is null;

alter table public.alert_digest_entries enable row level security;
create policy "no oauth clients" on public.alert_digest_entries as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- An alert everyone gets in a summary is 'batched' (no email of its own).
alter table public.alerts drop constraint alerts_status_check;
alter table public.alerts add constraint alerts_status_check
  check (status in ('pending', 'sent', 'logged', 'failed', 'batched'));
