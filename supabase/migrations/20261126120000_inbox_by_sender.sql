-- Inbox: one row per sender (approved 26 Nov, board "Inbox: one row per conversation").
--
-- 1. inbound_items.sender_key: who sent the message, per connected account. Email: the sender's
--    address, lower-case; DMs: the platform's sender id; comments: the commenter's id
--    (author.id), or "name:<handle>" when only the handle is known. Reviews and calls have none
--    (one row each). Set at arrival; a trigger fills it from the conversation or the handle when
--    the code that stored the message didn't know it (first-connect catch-up, polling).
-- 2. inbound_items.group_key (generated): the Inbox row a message belongs to.
-- 3. inbox_reads: when a person last opened a row ("3 new"), per login and brand.
-- 4. inbox_senders: senders Waggle flagged as automated (newsletters, product updates), and the
--    owner's "Move a sender to For you".
-- 5. inbox_conversations(): the grouped list, so the 100-row cap counts rows, not messages.
--
-- Additive only. The backfill reads stored webhook payloads for ids, never message text.

-- 1. sender_key ------------------------------------------------------------------------------

alter table public.inbound_items
  add column sender_key text check (char_length(sender_key) between 1 and 320);

create function private.email_address_in(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(substring(p_value from '[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+'));
$$;

-- Comments the webhook brought: the commenter's id from the stored payload.
update public.inbound_items i
  set sender_key = left(w.payload #>> '{comment,author,id}', 320)
  from public.webhook_events w
  where i.kind = 'comment'
    and i.sender_key is null
    and w.event_type = 'comment.received'
    and w.payload #>> '{comment,id}' = i.zernio_comment_id
    and coalesce(w.payload #>> '{comment,author,id}', '') <> '';

-- Email: the address of each message's own sender, from the stored payload.
update public.inbound_items i
  set sender_key = left(private.email_address_in(concat_ws(' ',
        w.payload #>> '{message,sender,id}',
        w.payload #>> '{message,sender,username}',
        w.payload #>> '{message,sender,name}')), 320)
  from public.webhook_events w, public.social_accounts a
  where i.kind = 'dm'
    and i.sender_key is null
    and a.id = i.social_account_id
    and a.platform in ('google', 'microsoft', 'imap')
    and w.event_type = 'message.received'
    and w.payload #>> '{message,id}' = i.zernio_message_id
    and private.email_address_in(concat_ws(' ',
        w.payload #>> '{message,sender,id}',
        w.payload #>> '{message,sender,username}',
        w.payload #>> '{message,sender,name}')) is not null;

-- The trigger's rule, also used for the rest of the backfill.
create function private.fallback_sender_key(
  p_kind text,
  p_conversation_id uuid,
  p_author_name text
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_kind = 'dm' then (
      select left(case
          when c.platform in ('google', 'microsoft', 'imap')
            then coalesce(private.email_address_in(c.participant_external_id),
                          lower(c.participant_external_id))
          else c.participant_external_id
        end, 320)
      from public.conversations c
      where c.id = p_conversation_id and coalesce(c.participant_external_id, '') <> ''
    )
    when p_kind = 'comment' and coalesce(btrim(p_author_name, ' @'), '') <> ''
      then left('name:' || lower(btrim(p_author_name, ' @')), 320)
    else null
  end;
$$;

update public.inbound_items i
  set sender_key = private.fallback_sender_key(i.kind, i.conversation_id, i.author_name)
  where i.sender_key is null and i.kind in ('dm', 'comment');

create function private.fill_sender_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_key is null and new.kind in ('dm', 'comment') then
    new.sender_key := private.fallback_sender_key(new.kind, new.conversation_id, new.author_name);
  end if;
  return new;
end;
$$;

create trigger inbound_items_fill_sender_key before insert on public.inbound_items
  for each row execute function private.fill_sender_key();

-- 2. group_key ------------------------------------------------------------------------------
-- DMs and email: one row per sender per account (an email sender across threads and subjects);
-- comments: one row per commenter across posts; reviews and calls: one row each.

alter table public.inbound_items add column group_key text generated always as (
  case
    when kind in ('dm', 'comment') and sender_key is not null
      then 's:' || social_account_id::text || ':' || sender_key
    when kind = 'dm' and conversation_id is not null then 'c:' || conversation_id::text
    else 'i:' || id::text
  end
) stored;

create index inbound_items_sender_idx
  on public.inbound_items (tenant_id, social_account_id, sender_key);
create index inbound_items_group_idx
  on public.inbound_items (tenant_id, group_key, received_at desc);
create index inbound_items_tenant_status_idx
  on public.inbound_items (tenant_id, status, received_at desc);

-- 3. inbox_reads ----------------------------------------------------------------------------

create table public.inbox_reads (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  group_key text not null check (char_length(group_key) between 1 and 400),
  seen_at timestamptz not null default now(),
  primary key (tenant_id, user_id, group_key)
);

alter table public.inbox_reads enable row level security;
grant select, insert, update on public.inbox_reads to authenticated;
create policy "members read their own" on public.inbox_reads
  for select to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select private.user_tenant_ids()));
create policy "members mark their own" on public.inbox_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()) and tenant_id in (select private.user_tenant_ids()));
create policy "members update their own" on public.inbox_reads
  for update to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select private.user_tenant_ids()))
  with check (user_id = (select auth.uid()) and tenant_id in (select private.user_tenant_ids()));
create policy "no oauth clients" on public.inbox_reads as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- 4. inbox_senders --------------------------------------------------------------------------

-- tenant_id has no foreign key of its own: the account's (social_account_id, tenant_id) key
-- covers it, and a second key to tenants would make the API see two paths from tenants to
-- social_accounts (embeds like tenants -> social_accounts would stop working).
create table public.inbox_senders (
  tenant_id uuid not null,
  social_account_id uuid not null,
  sender_key text not null check (char_length(sender_key) between 1 and 320),
  automated boolean not null default false,
  -- Why Waggle took it for an automated sender (never message text).
  automated_reason text check (automated_reason in
    ('list_header', 'unsubscribe_link', 'bulk_sender', 'no_reply')),
  -- "Move a sender to For you": their mail is treated as a customer's from then on.
  moved_to_for_you_at timestamptz,
  moved_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, social_account_id, sender_key),
  foreign key (social_account_id, tenant_id)
    references public.social_accounts (id, tenant_id) on delete cascade
);

alter table public.inbox_senders enable row level security;
grant select on public.inbox_senders to authenticated;
create policy "members read their tenant" on public.inbox_senders
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "no oauth clients" on public.inbox_senders as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- Senders already known as automated: email items whose words carry an unsubscribe line and a
-- link (the same test as automatedEmailReason in src/features/inbox/email-text.ts).
insert into public.inbox_senders (tenant_id, social_account_id, sender_key, automated, automated_reason)
select distinct i.tenant_id, i.social_account_id, i.sender_key, true, 'unsubscribe_link'
from public.inbound_items i
join public.social_accounts a on a.id = i.social_account_id
where i.kind = 'dm'
  and i.sender_key is not null
  and a.platform in ('google', 'microsoft', 'imap')
  and i.text ~* '(unsubscribe|opt[ -]?out of (these|this|our) emails|email preferences|manage (your )?(email )?preferences)'
  -- with a link (a customer asking to be taken off a list writes none)
  and i.text ~* '(https?://|\([a-z0-9.-]+\.[a-z]{2,}\))'
on conflict do nothing;

-- A purged brand's reads and senders go with it (T21).
create function private.forget_purged_inbox_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.inbox_reads where tenant_id = new.id;
  delete from public.inbox_senders where tenant_id = new.id;
  return new;
end;
$$;

create trigger tenants_forget_purged_inbox_rows after update of purged_at on public.tenants
  for each row when (old.purged_at is null and new.purged_at is not null)
  execute function private.forget_purged_inbox_rows();

-- 5. The grouped list -----------------------------------------------------------------------
-- Security invoker: the caller's RLS decides what it sees. One row per group_key among the items
-- in p_statuses, with the latest message's item, counts, and a priority rank:
--   1 needs you now (a complaint or bad review, a lead, couldn't be sent),
--   2 ready to approve (a reply waiting), 3 also for you.
-- "New": messages since the caller last opened the row; never opened, the ones waiting on them.
-- p_flags (any of): needs, ready, failed, leads, complaints, unread.
-- p_types (any of): dm, email, comment, review, call.

create function public.inbox_conversations(
  p_tenant_id uuid,
  p_statuses text[],
  p_platforms text[] default null,
  p_types text[] default null,
  p_flags text[] default null,
  p_customers_only boolean default true,
  p_automated boolean default false,
  p_sort text default 'priority',
  p_limit integer default 100
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

-- How many rows a tab has (counted by sender, not by message).
create function public.inbox_conversation_count(
  p_tenant_id uuid,
  p_statuses text[],
  p_customers_only boolean default true,
  p_automated boolean default false
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(distinct i.group_key)::int
  from public.inbound_items i
  left join public.inbox_senders s
    on s.tenant_id = i.tenant_id and s.social_account_id = i.social_account_id
   and s.sender_key = i.sender_key
  where i.tenant_id = p_tenant_id
    and i.status = any (p_statuses)
    and case
      when p_automated then coalesce(s.automated and s.moved_to_for_you_at is null, false)
      when p_customers_only then not coalesce(s.automated and s.moved_to_for_you_at is null, false)
      else true
    end;
$$;

revoke all on function public.inbox_conversations(uuid, text[], text[], text[], text[], boolean, boolean, text, integer) from public, anon;
revoke all on function public.inbox_conversation_count(uuid, text[], boolean, boolean) from public, anon;
grant execute on function public.inbox_conversations(uuid, text[], text[], text[], text[], boolean, boolean, text, integer) to authenticated, service_role;
grant execute on function public.inbox_conversation_count(uuid, text[], boolean, boolean) to authenticated, service_role;
