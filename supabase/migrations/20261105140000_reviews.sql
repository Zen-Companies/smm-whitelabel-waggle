-- T42 (docs/tdd.md §7.6): Facebook Page reviews (recommendations) as inbox items.
-- kind 'review': zernio_review_id is the dedupe key (Facebook sends no review webhooks, so the
-- job polls GET /v1/inbox/reviews). review_recommends: true = recommends, false = doesn't,
-- null = not given. A review's reply is public on the Page; it is never sent on its own.

-- The kind checks were created unnamed in 20261028123202_inbox_and_drafts; drop them by what
-- they check, then add named ones that include 'review'.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.inbound_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.inbound_items drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.inbound_items
  add column zernio_review_id text,
  add column review_recommends boolean;

alter table public.inbound_items
  add constraint inbound_items_kind_check check (kind in ('comment', 'dm', 'review')),
  add constraint inbound_items_kind_ids_check check (
    (kind = 'comment' and zernio_comment_id is not null)
    or (kind = 'dm' and zernio_message_id is not null and conversation_id is not null)
    or (kind = 'review' and zernio_review_id is not null)
  );

-- Not partial (nulls never collide), so the poller's upsert can name it as its conflict target.
create unique index inbound_items_account_review_key
  on public.inbound_items (social_account_id, zernio_review_id);

-- When the job last read this account's reviews (polled every few minutes, Facebook only).
alter table public.social_accounts add column reviews_polled_at timestamptz;
