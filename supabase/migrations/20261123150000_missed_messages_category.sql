-- Setup step 2's "What they wanted" from Jev (approved 23 Nov). Additive.
--
-- Locked DMs (missed_messages: older than Meta's 24-hour window) are now sorted by the classifier
-- during the 30-day read (the catch-up job, one call per conversation, at most 50 per catch-up).
-- The category is stored on every row of the conversation; null means not sorted (over the cap,
-- or the classifier failed) and setup falls back to keywords. Written with the service role only.

alter table public.missed_messages
  add column category text
    check (category in ('faq', 'lead', 'complaint', 'spam', 'unclear'));
