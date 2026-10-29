-- T14 publishing (PRD F3, docs/tdd.md §7.5).
--   queued      saved here, not yet accepted by Zernio (retried by the job route)
--   publishing  Zernio accepted a publish-now post and is posting it
alter table public.posts drop constraint posts_status_check;
alter table public.posts add constraint posts_status_check check (status in (
  'draft', 'queued', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled'
));

-- Per-platform outcome from post.* webhooks: [{ platform, status, url, error }].
alter table public.posts add column platform_results jsonb not null default '[]'::jsonb;
alter table public.posts add column published_at timestamptz;
-- Why a post failed or was cancelled, when it needs the owner:
--   zernio_paused     came due while Zernio was paused for billing (not retried by Zernio)
--   account_removed   cancelled because its only account was removed
alter table public.posts add column failure_reason text
  check (failure_reason in ('zernio_paused', 'account_removed'));
-- Attempts to hand the post to Zernio (the job route retries queued posts).
alter table public.posts add column attempts int not null default 0;
alter table public.posts add column next_attempt_at timestamptz;

create index posts_queued_idx on public.posts (next_attempt_at) where status = 'queued';
