-- In-app notification center (docs/design.md §5). Fed by triggers, in the same transaction as
-- the event: the T13 alerts (lead, message that needs the owner, account problem, replies
-- waiting), post outcomes, and replies sent automatically (batched per day).
-- Not in the Realtime publication (CLAUDE.md rule 15): the bell refreshes itself.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Last change (a batch that grew moves back to the top).
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in (
    'lead', 'needs_you', 'account', 'replies_waiting', 'post_published', 'post_failed',
    'auto_sent'
  )),
  -- Counts toward the bell's badge (leads, things to fix); updates don't.
  needs_action boolean not null default false,
  item_id uuid,
  social_account_id uuid,
  post_id uuid,
  -- Ids, reasons and counts only, never message text (CLAUDE.md rule 10).
  details jsonb not null default '{}'::jsonb,
  -- One row per event, except batches ('auto_sent:<tenant>:<day>').
  dedupe_key text not null unique,
  read_at timestamptz,
  foreign key (item_id, tenant_id)
    references public.inbound_items (id, tenant_id) on delete cascade,
  foreign key (social_account_id, tenant_id)
    references public.social_accounts (id, tenant_id) on delete cascade
);
create index notifications_tenant_idx on public.notifications (tenant_id, updated_at desc);
create index notifications_unread_idx on public.notifications (tenant_id)
  where read_at is null and needs_action;

alter table public.notifications enable row level security;
grant select, update (read_at) on public.notifications to authenticated;
create policy "members read their tenant" on public.notifications
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members mark their tenant's read" on public.notifications
  for update to authenticated
  using (tenant_id in (select private.user_tenant_ids()))
  with check (tenant_id in (select private.user_tenant_ids()));

-- Every owner alert is also a notification.
create function private.notify_from_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications
    (tenant_id, kind, needs_action, item_id, social_account_id, details, dedupe_key)
  values (
    new.tenant_id,
    case new.kind
      when 'lead' then 'lead'
      when 'escalation' then 'needs_you'
      when 'disconnect' then 'account'
      else 'replies_waiting'
    end,
    true,
    new.item_id,
    new.social_account_id,
    new.details || jsonb_build_object('alertId', new.id, 'leadId', new.lead_id),
    'alert:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return null;
end;
$$;

create trigger alerts_notify
after insert on public.alerts
for each row execute function private.notify_from_alert();

-- Post outcomes: published is an update; failed / partial / cancelled-with-a-reason need a fix.
create function private.notify_from_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' then
    insert into public.notifications (tenant_id, kind, needs_action, post_id, dedupe_key)
    values (new.tenant_id, 'post_published', false, new.id, 'post:' || new.id || ':published')
    on conflict (dedupe_key) do nothing;
  elsif new.status in ('failed', 'partial')
     or (new.status = 'cancelled' and new.failure_reason is not null) then
    insert into public.notifications (tenant_id, kind, needs_action, post_id, details, dedupe_key)
    values (new.tenant_id, 'post_failed', true, new.id,
            jsonb_build_object('status', new.status, 'failureReason', new.failure_reason),
            'post:' || new.id || ':' || new.status || ':' || txid_current())
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end;
$$;

create trigger posts_notify
after update of status on public.posts
for each row
when (old.status is distinct from new.status)
execute function private.notify_from_post();

-- Replies sent automatically (no owner decision): one batch per tenant per day, e.g.
-- "5 replies sent automatically"; a new one makes the batch unread again.
create function private.notify_auto_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (tenant_id, kind, needs_action, details, dedupe_key)
  values (new.tenant_id, 'auto_sent', false, jsonb_build_object('count', 1),
          'auto_sent:' || new.tenant_id || ':' || to_char(now() at time zone 'utc', 'YYYY-MM-DD'))
  on conflict (dedupe_key) do update set
    details = jsonb_build_object(
      'count', coalesce((public.notifications.details ->> 'count')::int, 0) + 1),
    updated_at = now(),
    read_at = null;
  return null;
end;
$$;

create trigger drafts_notify_auto_sent
after update of status on public.drafts
for each row
when (new.status = 'sent' and old.status is distinct from new.status and new.decided_by is null)
execute function private.notify_auto_sent();
