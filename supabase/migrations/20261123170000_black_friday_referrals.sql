-- Black Friday and "give a month, get a month" (Jason, 23 November 2026).
--   Black Friday: anyone who chooses a paid plan by Monday 30 November gets the first month free
--   (a 30-day trial on their first checkout; no code to type).
--   Referrals: each organization gets one link (app.gowaggle.ai/signup?ref=<code>). A friend who
--   signs up through it gets the first month free too; once the friend's first paid month goes
--   through, the organization that shared the link gets a month off its next bill (or banked until
--   it chooses a plan, if it's still on Free).
-- Server-only, like the other billing tables: RLS on, no policies, AI assistants' tokens refused.

create table public.referral_codes (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- 8 lowercase letters and digits: the same shape gowaggle.ai passes along (?ref=), so a link
  -- shared through the public site still lands.
  code text not null unique check (code ~ '^[a-z0-9]{8}$'),
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_org_id uuid not null references public.organizations (id) on delete cascade,
  -- One referral per new organization, ever.
  referred_org_id uuid not null unique references public.organizations (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  --  signed_up   the friend joined through the link (their first checkout gets the free month)
  --  reward_due  the friend's first paid invoice went through: the referrer is owed a month
  --  rewarded    the month was credited to the referrer's Stripe balance, or used as trial days
  --  banked      owed while the referrer has no paid plan; used on their first checkout
  status text not null default 'signed_up'
    check (status in ('signed_up', 'reward_due', 'rewarded', 'banked')),
  reward_due_at timestamptz,
  rewarded_at timestamptz,
  -- The Stripe customer balance transaction, or the Checkout Session whose trial used it.
  stripe_ref text,
  -- Cents credited (0 when it was used as trial days).
  reward_cents integer not null default 0 check (reward_cents >= 0),
  check (referrer_org_id <> referred_org_id)
);

create index referrals_referrer on public.referrals (referrer_org_id, status);
create index referrals_due on public.referrals (status) where status = 'reward_due';

alter table public.referrals enable row level security;

do $$
declare t text;
begin
  foreach t in array array['referral_codes', 'referrals'] loop
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated, anon '
      'using ((select auth.jwt() ->> ''client_id'') is null) '
      'with check ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end
$$;

-- How long the organization's trial is (7 days usually, 30 with the free month), so "day 3 of 30"
-- reads right. Filled from Stripe's trial_start/trial_end; null on bills from before.
alter table public.org_billing add column trial_days integer check (trial_days > 0);
