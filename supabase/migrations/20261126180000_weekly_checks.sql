-- Weekly check-up (board "Your week", approved 26 Nov). Every Monday at 7:00 AM in the business's
-- time zone, and on Check now (once a day), Waggle reads the week on every connected account,
-- adds what it missed to the Inbox (only messages it never saw) and stores the week's numbers here,
-- so Today and the Monday email read them without any AI. Additive only.

create table public.weekly_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- monday: the scheduled check-up; check_now: the owner's button (once a day per business).
  trigger text not null check (trigger in ('monday', 'check_now')),
  -- Monday runs: the local Monday the run belongs to (one per business per week).
  week_start date,
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  locked_at timestamptz,
  attempts integer not null default 0,
  -- Each account to read and where it got to: [{id, platform, name, state, reason}].
  accounts jsonb not null default '[]'::jsonb,
  -- Counted-only messages per account (answered on the platform, too old, praise) and topics.
  -- Counts and topic names only, never message text.
  tally jsonb not null default '{}'::jsonb,
  -- The week's numbers (features/weekly/summary.ts), written when the run is done.
  summary jsonb,
  -- The Monday email: pending once a Monday run is done, then sent or skipped.
  email_status text not null default 'none'
    check (email_status in ('none', 'pending', 'sending', 'sent', 'skipped')),
  email_sent_at timestamptz,
  check (trigger <> 'monday' or week_start is not null)
);

-- Monday run and Check now never run at the same time for one business.
create unique index weekly_checks_one_running_idx
  on public.weekly_checks (tenant_id) where status in ('queued', 'running');
-- One Monday check-up per business per week.
create unique index weekly_checks_monday_idx
  on public.weekly_checks (tenant_id, week_start) where trigger = 'monday';
create index weekly_checks_tenant_idx on public.weekly_checks (tenant_id, created_at desc);
create index weekly_checks_due_idx on public.weekly_checks (created_at)
  where status in ('queued', 'running');
create index weekly_checks_email_idx on public.weekly_checks (finished_at)
  where email_status = 'pending';

-- Members read their business's check-ups (Today's card); only the server writes them.
-- Not in the Realtime publication (Today polls the run while Check now is going).
alter table public.weekly_checks enable row level security;
grant select on public.weekly_checks to authenticated;
create policy "members read their tenant" on public.weekly_checks
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "no oauth clients" on public.weekly_checks as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- The Monday email can be turned off in Settings → Notifications, per person ('weekly').
alter table public.email_opt_outs drop constraint email_opt_outs_kind_check;
alter table public.email_opt_outs
  add constraint email_opt_outs_kind_check check (kind in ('check_in', 'weekly'));
