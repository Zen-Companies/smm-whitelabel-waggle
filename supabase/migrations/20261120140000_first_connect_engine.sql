-- First connect engine (decided 20 Nov): the "Here's what you've been missing" reveal. Additive
-- to 20261120100000_first_connect_catch_up.sql.
--
-- 1. A catch-up is keyed on the real account (platform + handle, or Zernio's account id), not on
--    Waggle's social_accounts row: deleting and reconnecting never repeats the AI work. The row
--    outlives its social account (set null instead of cascading).
-- 2. Caps and counters for the reading screen: posts/comments read, what was found, what wasn't
--    counted (praise and friend tags), what was over the sort cap, whether DMs were reachable.
-- 3. Pulled items carry their catch-up, the post's caption (for the reveal's labels and the top
--    questions), and when a draft was asked for (the reveal's first 20, or the owner opening one).
-- 4. A new item status, awaiting_draft: a pulled question or lead past the reveal's 20 drafts
--    waits here, undrafted, until the owner opens it (features/inbox/status.ts).
-- 5. A draft replaced after the owner changed an answer is 'superseded'.

-- 1. Account identity.
alter table public.catch_ups
  add column platform text,
  add column account_key text,
  add column zernio_account_id text,
  add column handle text;

update public.catch_ups c
  set platform = a.platform,
      zernio_account_id = a.zernio_account_id,
      handle = a.username,
      account_key = case
        when coalesce(trim(a.username), '') <> ''
          then a.platform || ':@' || lower(regexp_replace(trim(a.username), '^@', ''))
        else a.platform || ':zernio:' || a.zernio_account_id
      end
  from public.social_accounts a
  where a.id = c.social_account_id;

create unique index catch_ups_account_key_idx on public.catch_ups (account_key)
  where account_key is not null;
create index catch_ups_zernio_account_idx on public.catch_ups (zernio_account_id)
  where zernio_account_id is not null;

alter table public.catch_ups alter column social_account_id drop not null;
alter table public.catch_ups drop constraint catch_ups_social_account_id_fkey;
alter table public.catch_ups
  add constraint catch_ups_social_account_id_fkey foreign key (social_account_id)
  references public.social_accounts (id) on delete set null;

-- A purged brand's catch-ups go with it (T21; they no longer go with the account row).
create function private.forget_purged_catch_ups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.catch_ups where tenant_id = new.id;
  return new;
end;
$$;

create trigger tenants_forget_purged_catch_ups after update of purged_at on public.tenants
  for each row when (old.purged_at is null and new.purged_at is not null)
  execute function private.forget_purged_catch_ups();

-- 2. Caps and counters.
alter table public.catch_ups
  -- Resume point inside a page of posts (posts already done on the page at posts_cursor).
  add column post_offset integer not null default 0,
  add column posts_read integer not null default 0,
  add column comments_read integer not null default 0,
  -- Unanswered customer comments found in the window (the reading screen's counter; DMs are
  -- counted from the rows they became, which a re-sweep can't double).
  add column comments_found integer not null default 0,
  -- Not counted: emoji-only, tag-only, short praise, giveaway posts.
  add column praise_and_tags integer not null default 0,
  -- Found but past the sort cap (counted, not sorted).
  add column over_cap integer not null default 0,
  add column capped boolean not null default false,
  -- Listing the account's conversations failed for lack of message access.
  add column dm_access_missing boolean not null default false,
  -- Reading done (comments and the first DM sweep): the sort-stall clock starts here.
  add column read_at timestamptz,
  -- Sorting done and the reveal's drafts picked.
  add column sorted_at timestamptz,
  -- The top questions (one AI call, cached): [{question, count, items: [{item, count}], unsure}].
  add column top_questions jsonb,
  add column top_questions_at timestamptz;

-- The finishing pass looks for read-but-not-sorted catch-ups.
create index catch_ups_unsorted_idx on public.catch_ups (created_at)
  where sorted_at is null and stage in ('dms_again', 'done');

-- 3. Pulled items.
alter table public.inbound_items
  add column catch_up_id uuid references public.catch_ups (id) on delete set null,
  add column post_caption text,
  add column draft_requested_at timestamptz;
create index inbound_items_catch_up_idx on public.inbound_items (catch_up_id, status)
  where catch_up_id is not null;

-- 4. awaiting_draft.
alter table public.inbound_items drop constraint inbound_items_status_check;
alter table public.inbound_items add constraint inbound_items_status_check check (status in (
  'new', 'classified', 'drafted', 'awaiting_approval', 'sending', 'sent', 'rejected', 'ignored',
  'escalated', 'paused', 'failed', 'handled', 'awaiting_draft'
));

-- 5. Superseded drafts.
alter table public.drafts drop constraint drafts_status_check;
alter table public.drafts add constraint drafts_status_check
  check (status in ('pending', 'approved', 'rejected', 'sent', 'failed', 'superseded'));
