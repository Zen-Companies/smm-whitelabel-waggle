-- Pricing Bible, 24 Nov (Jason, FINAL; docs/plans/pricing-bible-24nov.md). Additive only.
--
-- 1. The offer never states an end date in public. Black Friday and "give a month, get a month"
--    lose their end dates (they run until our team switches them off on Staff → Promotions; a
--    date set there later only switches them off, the app never shows it), the "Ends in N days"
--    countdown and the last-day face are cleared, and the Black Friday copy says the offer with
--    no date. Logged in promotion_changes (CLAUDE.md rule 11).
-- 2. trial_reminders: the reminder before the first charge. Stripe's
--    customer.subscription.trial_will_end (3 days before a trial ends) stores one row per
--    subscription (the webhook only stores, rule 3); the jobs route emails the organization's
--    Owner(s) once, then marks it sent.

-- 1. Promotions -----------------------------------------------------------------------------

with before as (
  select * from public.promotions where id in ('black-friday-2026', 'give-a-month')
),
changed as (
  update public.promotions p
  set
    ends_at = null,
    countdown = false,
    last_day_starts_at = null,
    last_bar_label = '',
    last_bar_text = '',
    last_bar_phone_text = '',
    last_day_name_1 = '',
    last_day_name_2 = '',
    last_headline = '',
    last_subline = '',
    bar_text = case when p.id = 'black-friday-2026'
      then E'Your first month is free on Solo and Team\nCard today, $0 for 30 days. We email you before the first charge\nGive a month, get a month: *refer a friend*'
      else p.bar_text end,
    bar_phone_text = case when p.id = 'black-friday-2026'
      then 'First month free on Solo and Team'
      else p.bar_phone_text end,
    headline = case when p.id = 'black-friday-2026'
      then 'Your first month is free.'
      else p.headline end,
    subline = case
      when p.id = 'black-friday-2026'
        then 'Black Friday: your first month is free on Solo and Team. Card today, $0 for 30 days, and we email you before the first charge.'
      when p.id = 'give-a-month'
        then replace(p.subline, 'on any paid plan you choose', 'on Solo or Team')
      else p.subline end,
    updated_at = now()
  from before b
  where p.id = b.id
  returning p.*
)
insert into public.promotion_changes (promotion_id, changed_by, action, before, after)
select c.id, null, 'updated', to_jsonb(b), to_jsonb(c)
from changed c join before b on b.id = c.id;

-- 2. Reminder before the first charge ---------------------------------------------------------

-- One row per subscription: its trial is reminded once. Organization rows written only by the
-- webhook and the jobs route (service role): RLS on, no policies, AI assistants' tokens refused
-- (like first_morning_emails).
create table public.trial_reminders (
  stripe_subscription_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- What the first charge is: the plan (Waggle's id), its interval and the amount in cents.
  plan text not null,
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  amount_cents integer not null check (amount_cents >= 0),
  -- When Stripe charges it (the trial's end).
  charge_at timestamptz not null,
  -- 'queued' until a run claims it; 'sending' while one sends (a crash leaves it: never twice);
  -- 'skipped' when there is no one to email or the trial is no longer running.
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'skipped')),
  reason text,
  sent_at timestamptz
);

create index trial_reminders_queued on public.trial_reminders (created_at) where status = 'queued';

alter table public.trial_reminders enable row level security;
create policy "no oauth clients" on public.trial_reminders as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
