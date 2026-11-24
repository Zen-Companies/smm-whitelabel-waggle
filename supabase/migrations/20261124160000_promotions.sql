-- Promotions our team edits on Staff → Promotions without a release (docs/plans/promotions.md,
-- 24 Nov): the moving bar above the navbar, the pass on Your plan, the free month at checkout and
-- the referral program's reward. One row per promotion; the app reads them server-side (service
-- role) and falls back to the code's defaults (src/features/billing/promotions.ts) when the table
-- is empty or unreachable. Not a tenant table: promotions are global. Server-only like
-- plan_settings: RLS on, no policies, AI assistants' tokens refused.
--
-- Bar texts hold one drifting line per text line; a line's honey tail is wrapped in *stars*
-- ("Give a month, get a month: *refer a friend*").

create table public.promotions (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name text not null check (length(name) between 1 and 60),
  kind text not null check (kind in ('seasonal', 'referral')),
  enabled boolean not null default false,
  -- null: already running / no end.
  starts_at timestamptz,
  ends_at timestamptz,
  -- Days free on the organization's first plan checkout.
  trial_days integer not null default 30 check (trial_days between 1 and 90),
  -- Your plan: "Ends in N days".
  countdown boolean not null default false,
  -- Referral program: months credited to the referrer per friend's first payment.
  reward_months integer not null default 1 check (reward_months between 0 and 12),
  -- The bar above the navbar.
  bar_enabled boolean not null default false,
  audience text not null default 'never_paid_owners'
    check (audience in ('never_paid_owners', 'all_owners', 'everyone')),
  bar_label text not null default '',
  bar_text text not null default '',
  bar_phone_text text not null default '',
  bar_cta text not null default 'Choose a plan →',
  bar_phone_cta text not null default 'Plans →',
  -- 'plan-popup' opens the plan pop-up in place; otherwise an app path.
  bar_link text not null default 'plan-popup'
    check (bar_link = 'plan-popup' or bar_link ~ '^/[A-Za-z0-9/_#?=&.-]*$'),
  -- The pass on Your plan.
  day_name_1 text not null default '',
  day_name_2 text not null default '',
  headline text not null default '',
  subline text not null default '',
  -- The last-day face (Cyber Monday): from last_day_starts_at to the end. null: none.
  last_day_starts_at timestamptz,
  last_bar_label text not null default '',
  last_bar_text text not null default '',
  last_bar_phone_text text not null default '',
  last_day_name_1 text not null default '',
  last_day_name_2 text not null default '',
  last_headline text not null default '',
  last_subline text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

alter table public.promotions enable row level security;

-- Staff → Promotions changes, kept (CLAUDE.md rule 11): who changed which promotion, from what
-- to what. Global, like plan_settings_changes.
create table public.promotion_changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  promotion_id text not null,
  changed_by uuid references auth.users (id) on delete set null,
  -- 'created', 'updated', 'enabled', 'disabled'
  action text not null check (action in ('created', 'updated', 'enabled', 'disabled')),
  before jsonb not null,
  after jsonb not null
);

create index promotion_changes_promotion on public.promotion_changes (promotion_id, created_at desc);

alter table public.promotion_changes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['promotions', 'promotion_changes'] loop
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated, anon '
      'using ((select auth.jwt() ->> ''client_id'') is null) '
      'with check ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end
$$;

-- Today's code values (promotions.ts, 24 Nov).
insert into public.promotions (
  id, name, kind, enabled, starts_at, ends_at, trial_days, countdown, reward_months,
  bar_enabled, audience, bar_label, bar_text, bar_phone_text, bar_cta, bar_phone_cta, bar_link,
  day_name_1, day_name_2, headline, subline,
  last_day_starts_at, last_bar_label, last_bar_text, last_bar_phone_text,
  last_day_name_1, last_day_name_2, last_headline, last_subline
) values (
  'black-friday-2026', 'Black Friday 2026', 'seasonal', true, null, '2026-12-01T04:59:59Z', 30, true, 1,
  true, 'never_paid_owners', 'Black Friday',
  E'Your first month on any plan is free\nChoose a plan by Mon 30 Nov, 11:59 pm ET\nGive a month, get a month: *refer a friend*',
  E'First month free on any plan\nEnds Mon 30 Nov',
  'Choose a plan →', 'Plans →', 'plan-popup',
  'Black', 'Friday', 'Your first month is free.',
  'Choose any plan by Monday, 30 Nov · 11:59 pm ET. Card today, $0 until 30 days later.',
  '2026-11-30T05:00:00Z', 'Cyber Monday',
  E'Last day: your first month on any plan is free\nEnds tonight, 11:59 pm ET\nGive a month, get a month: *refer a friend*',
  E'Last day: first month free\nEnds tonight',
  'Cyber', 'Monday', 'Last day: your first month is free.',
  'Choose any plan before 11:59 pm ET tonight.'
), (
  'give-a-month', 'Give a month, get a month', 'referral', true, null, null, 30, false, 1,
  false, 'all_owners', 'Give a month, get a month',
  E'Send a friend your link: *their first month is free*\nYou get a month free after their first payment',
  E'Refer a friend: *a month free*',
  'Get your link →', 'Link →', '/plan#referral-title',
  'A friend’s', 'month', 'Your first month is free.',
  '{name} sent you. It’s on any paid plan you choose, no code needed.',
  null, '', '', '', '', '', '', ''
);
