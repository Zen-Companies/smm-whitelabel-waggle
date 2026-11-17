-- Billing with Stripe (T86, Pricing Bible). The organization owns the bill (decided 10 Nov), so
-- these are organization rows, not tenant rows. Written only by the server: from the Stripe
-- webhook (the subscription as Stripe holds it) and the owner's own choices on Your plan.
-- RLS on, no policies: the browser never reads them directly.

create table public.org_billing (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  plan text check (plan in ('solo', 'business', 'team')),
  billing_interval text check (billing_interval in ('month', 'year')),
  -- Stripe's subscription status: trialing, active, past_due, unpaid, canceled, incomplete, ...
  status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  extra_accounts integer not null default 0 check (extra_accounts >= 0),
  founding boolean not null default false,
  -- Opt-in only (Pricing Bible): at most twice a month, an email receipt each time.
  auto_top_up boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.org_billing enable row level security;

-- 200 more AI replies, one row per paid top-up (bought, or added automatically). Unused ones
-- carry over one month.
create table public.reply_top_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  replies integer not null check (replies > 0),
  -- The Stripe Checkout Session or Invoice it was paid with (one top-up each).
  stripe_ref text not null unique,
  automatic boolean not null default false,
  created_at timestamptz not null default now()
);

create index reply_top_ups_org_created on public.reply_top_ups (organization_id, created_at);

alter table public.reply_top_ups enable row level security;
