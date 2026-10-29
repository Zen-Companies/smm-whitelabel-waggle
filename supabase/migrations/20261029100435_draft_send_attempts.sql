-- T12 sending (docs/tdd.md §7.4). Set just before a send request leaves, cleared when the outcome
-- is known (sent, or a definite rejection such as 429/4xx). Still set on the next attempt means
-- the previous request may have been delivered (5xx, timeout, crash): reconcile before resending
-- (CLAUDE.md rule 7).
alter table public.drafts add column send_attempted_at timestamptz;

-- Delivery failures reported later (message.failed) find the draft by the provider's id.
create index drafts_zernio_reply_id_idx on public.drafts (zernio_reply_id)
  where zernio_reply_id is not null;
