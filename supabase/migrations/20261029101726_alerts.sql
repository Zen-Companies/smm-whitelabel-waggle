-- T13 owner alerts (PRD F11, F12; docs/tdd.md §7.2). An outbox: rows are queued by triggers
-- here, in the same transaction as the change that causes them, and sent by the job route
-- (features/alerts). dedupe_key makes each alert exactly one row, so one email.
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('escalation', 'lead', 'disconnect', 'draft_waiting')),
  item_id uuid,
  social_account_id uuid,
  lead_id uuid references public.leads (id) on delete cascade,
  -- Ids and reasons only, never message text (CLAUDE.md rule 10).
  details jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'logged', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  foreign key (item_id, tenant_id)
    references public.inbound_items (id, tenant_id) on delete cascade,
  foreign key (social_account_id, tenant_id)
    references public.social_accounts (id, tenant_id) on delete cascade
);
create index alerts_pending_idx on public.alerts (created_at) where status = 'pending';
create index alerts_tenant_id_idx on public.alerts (tenant_id, created_at desc);

-- Server-only (no client grants): written by triggers, read and updated by the job route.
alter table public.alerts enable row level security;

-- When a draft's owner was nudged about it waiting (one nudge per draft).
alter table public.drafts add column nudged_at timestamptz;

-- Escalated or failed item → one escalation email (complaints, unclear, not covered by the KB,
-- DM window closed, failed sends, undelivered replies).
create function private.enqueue_escalation_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.alerts (tenant_id, kind, item_id, details, dedupe_key)
  values (new.tenant_id, 'escalation', new.id,
          jsonb_build_object('status', new.status, 'from', old.status, 'category', new.category),
          'escalation:' || new.id)
  on conflict (dedupe_key) do nothing;
  return null;
end;
$$;

create trigger inbound_items_escalation_alert
after update of status on public.inbound_items
for each row
when (new.status in ('escalated', 'failed') and old.status is distinct from new.status)
execute function private.enqueue_escalation_alert();

-- New lead → one lead email.
create function private.enqueue_lead_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.alerts (tenant_id, kind, item_id, lead_id, dedupe_key)
  values (new.tenant_id, 'lead', new.item_id, new.id, 'lead:' || new.id)
  on conflict (dedupe_key) do nothing;
  return null;
end;
$$;

create trigger leads_alert
after insert on public.leads
for each row execute function private.enqueue_lead_alert();

-- Account goes from active to disconnected/error → one email per drop (keyed by transaction).
create function private.enqueue_disconnect_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.alerts (tenant_id, kind, social_account_id, details, dedupe_key)
  values (new.tenant_id, 'disconnect', new.id,
          jsonb_build_object('platform', new.platform, 'status', new.status),
          'disconnect:' || new.id || ':' || txid_current())
  on conflict (dedupe_key) do nothing;
  return null;
end;
$$;

create trigger social_accounts_disconnect_alert
after update of status on public.social_accounts
for each row
when (old.status = 'active' and new.status <> 'active')
execute function private.enqueue_disconnect_alert();

-- Drafts waiting for approval longer than p_older_than → one nudge per tenant per sweep, each
-- draft nudged once. Called by the job route.
create function public.enqueue_draft_nudges(p_older_than interval)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    with due as (
      select d.id, d.tenant_id
      from public.drafts d
      join public.inbound_items i on i.id = d.item_id
      where d.status = 'pending'
        and d.nudged_at is null
        and i.status = 'awaiting_approval'
        and d.created_at < now() - p_older_than
      for update of d skip locked
    ), marked as (
      update public.drafts d set nudged_at = now()
      from due where d.id = due.id
      returning d.id, d.tenant_id
    )
    select tenant_id, array_agg(id order by id) as draft_ids from marked group by tenant_id
  loop
    insert into public.alerts (tenant_id, kind, details, dedupe_key)
    values (r.tenant_id, 'draft_waiting',
            jsonb_build_object('draftIds', to_jsonb(r.draft_ids)),
            'draft_waiting:' || r.draft_ids[1])
    on conflict (dedupe_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.enqueue_draft_nudges(interval) from public, anon, authenticated;
grant execute on function public.enqueue_draft_nudges(interval) to service_role;
