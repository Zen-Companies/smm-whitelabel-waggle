-- First connect on a busy account (decided 20 Nov). Additive to 20261120140000_first_connect_engine.sql.
--
-- 1. The top questions are built early (once 50 questions are sorted, or 2 minutes in with one)
--    and once more when sorting is done (final). top_questions_at is when any were stored;
--    top_questions_final_at when the final ones were. Never more than these two AI calls.
-- 2. "Your customers' top 3 questions are ready · Answer them" (Today and setup step 3) can be
--    dismissed in place: who and when.

alter table public.catch_ups
  add column top_questions_final_at timestamptz,
  add column top_questions_notice_dismissed_at timestamptz,
  add column top_questions_notice_dismissed_by uuid references auth.users (id) on delete set null;

-- Catch-ups already sorted have their final top questions.
update public.catch_ups
  set top_questions_final_at = coalesce(top_questions_at, sorted_at)
  where sorted_at is not null;

-- The early pass looks for recent catch-ups still sorting with no top questions yet.
create index catch_ups_early_questions_idx on public.catch_ups (created_at)
  where sorted_at is null and top_questions_at is null;
