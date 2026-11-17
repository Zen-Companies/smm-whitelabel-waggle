-- Every Zernio platform (design "Every Zernio platform: honest connect note, usage at cost",
-- approved 18 Nov). Global, server-only tables (not tenant tables): plans of what owners see.

-- Staff → Platforms: what owners see per platform. No row = the code's default.
create table public.platform_settings (
  platform text primary key,
  status text not null check (status in ('hidden', 'soon', 'available')),
  -- What the platform's sign-in showed on the last connect: Zernio's welcome page with our
  -- brand, or the platform's own page straight away (so the "Before you connect" note shows).
  last_signin text check (last_signin in ('welcome', 'platform')),
  last_signin_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.platform_settings enable row level security;

create policy "no oauth clients" on public.platform_settings as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- Who changed which platform, from what to what (CLAUDE.md rule 11).
create table public.platform_settings_changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  platform text not null,
  changed_by uuid references auth.users (id) on delete set null,
  before text,
  after text not null
);

alter table public.platform_settings_changes enable row level security;

create policy "no oauth clients" on public.platform_settings_changes as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- Usage at cost: one row per invoice (or trial that ended without one) that needs the
-- organization's pay-per-use added. The Stripe webhook only stores the row (rule 3); the jobs
-- route reads Zernio's usage and adds the lines.
create table public.usage_charges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- 'invoice': lines on a renewal invoice still in draft. 'trial_end': a trial cancelled before
  -- its first invoice, charged on its own.
  kind text not null check (kind in ('invoice', 'trial_end')),
  stripe_invoice_id text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'added', 'none', 'missed', 'failed')),
  amount_cents integer,
  lines jsonb,
  done_at timestamptz,
  unique (organization_id, kind, period_start)
);
create unique index usage_charges_invoice_idx on public.usage_charges (stripe_invoice_id)
  where stripe_invoice_id is not null;
create index usage_charges_pending_idx on public.usage_charges (created_at) where status = 'pending';

alter table public.usage_charges enable row level security;

create policy "no oauth clients" on public.usage_charges as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
