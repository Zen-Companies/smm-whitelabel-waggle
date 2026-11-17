-- T75c: the owner took a published post down from the platforms that allow it.
--   taken_down  the owner removed it (Zernio then reports the post as cancelled)
alter table public.posts drop constraint posts_failure_reason_check;
alter table public.posts add constraint posts_failure_reason_check
  check (failure_reason in ('zernio_paused', 'account_removed', 'taken_down'));
alter table public.posts add column taken_down_at timestamptz;
