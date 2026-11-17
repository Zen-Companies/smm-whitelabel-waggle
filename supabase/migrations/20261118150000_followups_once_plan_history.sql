-- Review fixes for billing round 2 (18 Nov).

-- Follow-ups go once per conversation, not per lead: one DM thread often has several leads
-- (each lead-classified message), and the customer must get one follow-up.
alter table public.conversations add column followed_up_at timestamptz;

-- Staff → Plans changes, kept (CLAUDE.md rule 11): who changed which plan, from what to what.
-- Not a tenant table: plans are global. Server-only.
create table public.plan_settings_changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plan text not null check (plan in ('solo', 'business', 'team')),
  changed_by uuid references auth.users (id) on delete set null,
  before jsonb not null,
  after jsonb not null
);

alter table public.plan_settings_changes enable row level security;

create policy "no oauth clients" on public.plan_settings_changes as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
