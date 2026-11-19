-- First-connect catch-up (Free plan, decided 19 Nov). When an account is connected for the first
-- time, Waggle pulls the last 30 days of comments and DMs. Comments and DMs from the last 24 hours
-- become ordinary inbound items (drafted like webhook ones). Older unanswered DMs can't be answered
-- (Meta's 24-hour window), so they are kept apart in missed_messages: shown, never drafted or sent.

-- One catch-up per account, the job's progress (resumable) and what Today's card shows.
create table public.catch_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  social_account_id uuid not null unique references public.social_accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Where the job is: comments, then DMs, then DMs once more (Zernio's replay of past DMs can
  -- finish after the first listing), then done.
  stage text not null default 'comments' check (stage in ('comments', 'dms', 'dms_again', 'done')),
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  attempts integer not null default 0,
  -- Resume points: the commented-posts cursor and how many conversations were already read.
  posts_cursor text,
  dm_offset integer not null default 0,
  -- What the pull created (only new rows count, so a rerun never inflates them).
  comments_created integer not null default 0,
  dms_created integer not null default 0,
  finished_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users (id) on delete set null
);
create index catch_ups_due_idx on public.catch_ups (next_run_at) where stage <> 'done';
create index catch_ups_tenant_idx on public.catch_ups (tenant_id);

-- Unanswered DMs older than the 24-hour reply window. Not inbound items, so nothing in the
-- pipeline (drafting, policy, sending) can ever pick them up.
create table public.missed_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  zernio_conversation_id text not null,
  -- Meta's message id (the webhook's message.platformMessageId).
  platform_message_id text not null,
  sender_name text,
  text text not null default '',
  received_at timestamptz not null,
  unique (social_account_id, platform_message_id)
);
create index missed_messages_tenant_idx on public.missed_messages (tenant_id, received_at desc);

-- A pulled DM and a later webhook for the same message share Meta's id: one item, never two.
create unique index inbound_items_account_platform_message_idx
  on public.inbound_items (social_account_id, platform_message_id)
  where platform_message_id is not null;

alter table public.catch_ups enable row level security;
alter table public.missed_messages enable row level security;
grant select on public.catch_ups, public.missed_messages to authenticated;
create policy "members read their tenant" on public.catch_ups
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.missed_messages
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "no oauth clients" on public.catch_ups as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy "no oauth clients" on public.missed_messages as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
