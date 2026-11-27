-- Posts Round 5 (board "Posts Round 5", approved 27 Nov). Additive only.
--   1. Write with Waggle: the composer's caption calls are recorded in ai_usage as 'caption'.
--   2. Repeat posts: a repeat rule per repeating post. Zernio has recurring queue slots, not
--      repeating posts (docs.zernio.com/guides/queue-scheduling), so Waggle makes each next post
--      itself from the rule's copy of the text and files (the same each time).
--   3. "See comments in Inbox": the Inbox list can be narrowed to one post's comments.

-- 1. -------------------------------------------------------------------------------------------
alter table public.ai_usage drop constraint ai_usage_purpose_check;
alter table public.ai_usage
  add constraint ai_usage_purpose_check
  check (purpose in ('classify', 'draft', 'embed', 'agent', 'setup', 'caption'));

-- 2. -------------------------------------------------------------------------------------------
create table public.post_repeats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  every text not null check (every in ('day', 'week', 'month')),
  -- week: the weekday (0 Sunday … 6 Saturday); month: the day of the month (31 = the last day
  -- in shorter months). Both from the first post's day.
  weekday smallint check (weekday between 0 and 6),
  month_day smallint check (month_day between 1 and 31),
  -- Wall clock "HH:MM" in time_zone: 9:00 stays 9:00 across a daylight-saving change.
  at_time text not null check (at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  time_zone text not null,
  ends text not null default 'never' check (ends in ('never', 'on', 'after')),
  end_date date,
  max_count integer check (max_count between 1 and 366),
  -- Posts made so far (the first one counts).
  made_count integer not null default 1,
  -- What every repeat posts: the same text, files, accounts and choices each time. "This and the
  -- ones after" replaces it with the edited post's.
  content text not null,
  media jsonb not null default '[]'::jsonb,
  target_account_ids uuid[] not null,
  platform_options jsonb not null default '{}'::jsonb,
  tiktok_consent boolean not null default false,
  -- The latest post made, and the rule's slot it was made for (an edit of just that post can move
  -- it; the next one still follows the rule).
  last_post_id uuid references public.posts (id) on delete set null,
  last_slot timestamptz not null,
  -- Couldn't make the next one (an account disconnected…): tried again from then. A reason code.
  next_try_at timestamptz,
  last_error text,
  stopped_at timestamptz,
  stopped_by uuid references auth.users (id) on delete set null,
  finished_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (every <> 'week' or weekday is not null),
  check (every <> 'month' or month_day is not null),
  check (ends <> 'on' or end_date is not null),
  check (ends <> 'after' or max_count is not null)
);

create index post_repeats_tenant_idx on public.post_repeats (tenant_id, created_at desc);
create index post_repeats_active_idx on public.post_repeats (created_at)
  where stopped_at is null and finished_at is null;

alter table public.posts
  add column repeat_id uuid references public.post_repeats (id) on delete set null;
create index posts_repeat_idx on public.posts (repeat_id) where repeat_id is not null;

-- Members read their business's repeats (the post panel, the calendar's ↻); only the server
-- writes them. Not in the Realtime publication.
alter table public.post_repeats enable row level security;
grant select on public.post_repeats to authenticated;
create policy "members read their tenant" on public.post_repeats
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "no oauth clients" on public.post_repeats as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- A purged brand's repeats go with it (T21; they hold its post text).
create function private.forget_purged_post_repeats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_repeats where tenant_id = new.id;
  return new;
end;
$$;

create trigger tenants_forget_purged_post_repeats after update of purged_at on public.tenants
  for each row when (old.purged_at is null and new.purged_at is not null)
  execute function private.forget_purged_post_repeats();

-- 3. -------------------------------------------------------------------------------------------
-- The grouped list gains p_post_ids: only comments on these posts (the platform's post ids, as
-- comments carry them). Same body otherwise (20261126120000_inbox_by_sender.sql, section 5).
drop function public.inbox_conversations(uuid, text[], text[], text[], text[], boolean, boolean, text, integer);

create function public.inbox_conversations(
  p_tenant_id uuid,
  p_statuses text[],
  p_platforms text[] default null,
  p_types text[] default null,
  p_flags text[] default null,
  p_customers_only boolean default true,
  p_automated boolean default false,
  p_sort text default 'priority',
  p_limit integer default 100,
  p_post_ids text[] default null
)
returns table (
  group_key text,
  item_id uuid,
  social_account_id uuid,
  sender_key text,
  platform text,
  latest_at timestamptz,
  messages integer,
  waiting integer,
  new_messages integer,
  threads integer,
  posts integer,
  rank integer,
  automated boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with items as (
    select i.id, i.group_key, i.social_account_id, i.sender_key, i.kind, i.status, i.category,
           i.received_at, i.conversation_id, i.zernio_post_id, i.review_rating,
           i.review_recommends, a.platform,
           coalesce(s.automated and s.moved_to_for_you_at is null, false) as automated,
           case when i.kind = 'dm' and a.platform in ('google', 'microsoft', 'imap') then 'email'
                else i.kind end as type
    from public.inbound_items i
    join public.social_accounts a on a.id = i.social_account_id
    left join public.inbox_senders s
      on s.tenant_id = i.tenant_id and s.social_account_id = i.social_account_id
     and s.sender_key = i.sender_key
    where i.tenant_id = p_tenant_id
      and i.status = any (p_statuses)
      and (p_platforms is null or a.platform = any (p_platforms))
      and (p_post_ids is null or i.zernio_post_id = any (p_post_ids))
  ),
  kept as (
    select * from items it
    where (p_types is null or it.type = any (p_types))
      and case when p_automated then it.automated
               when p_customers_only then not it.automated
               else true end
  ),
  groups as (
    select k.group_key,
           (array_agg(k.id order by k.received_at desc, k.id desc))[1] as item_id,
           (array_agg(k.social_account_id))[1] as social_account_id,
           (array_agg(k.sender_key))[1] as sender_key,
           (array_agg(k.platform))[1] as platform,
           max(k.received_at) as latest_at,
           count(*)::int as messages,
           (count(*) filter (where k.status in
             ('awaiting_approval', 'awaiting_draft', 'escalated', 'failed')))::int as waiting,
           count(distinct k.conversation_id)::int as threads,
           count(distinct k.zernio_post_id)::int as posts,
           bool_or(k.category = 'complaint'
             or (k.kind = 'review' and (k.review_rating <= 2 or k.review_recommends = false)))
             as has_complaint,
           bool_or(k.category = 'lead') as has_lead,
           bool_or(k.status = 'failed') as has_failed,
           bool_or(k.status in ('escalated', 'awaiting_draft')) as has_needs,
           bool_or(k.status = 'awaiting_approval') as has_ready,
           bool_or(k.automated) as automated
    from kept k
    group by k.group_key
  ),
  counted as (
    select g.*,
           case when r.seen_at is null then g.waiting
                else (select count(*)::int from public.inbound_items x
                      where x.tenant_id = p_tenant_id and x.group_key = g.group_key
                        and x.status <> 'ignored' and x.received_at > r.seen_at)
           end as new_messages,
           case when coalesce(g.has_complaint, false) or coalesce(g.has_lead, false)
                  or g.has_failed then 1
                when g.has_ready then 2
                else 3 end as rank
    from groups g
    left join public.inbox_reads r
      on r.tenant_id = p_tenant_id and r.user_id = (select auth.uid()) and r.group_key = g.group_key
  )
  select c.group_key, c.item_id, c.social_account_id, c.sender_key, c.platform, c.latest_at,
         c.messages, c.waiting, c.new_messages, c.threads, c.posts, c.rank, c.automated
  from counted c
  where p_flags is null
     or ('needs' = any (p_flags) and c.has_needs)
     or ('ready' = any (p_flags) and c.has_ready)
     or ('failed' = any (p_flags) and c.has_failed)
     or ('leads' = any (p_flags) and coalesce(c.has_lead, false))
     or ('complaints' = any (p_flags) and coalesce(c.has_complaint, false))
     or ('unread' = any (p_flags) and c.new_messages > 0)
  order by case when p_sort = 'priority' then c.rank else 0 end, c.latest_at desc, c.group_key
  limit least(greatest(p_limit, 1), 200);
$$;


revoke all on function public.inbox_conversations(uuid, text[], text[], text[], text[], boolean, boolean, text, integer, text[]) from public, anon;
grant execute on function public.inbox_conversations(uuid, text[], text[], text[], text[], boolean, boolean, text, integer, text[]) to authenticated, service_role;
