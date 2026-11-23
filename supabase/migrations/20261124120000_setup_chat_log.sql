-- Step 3's thread history (user feedback, 23 Nov). Additive only; RLS unchanged (tenants already
-- has it). Written with the service role by the app after its role check (brand.settings), so no
-- new column grants to owners.
--
-- setup_chat_log: everything said in the setup chat besides the fixed questions (whose answers
-- stay in setup_chat): the owner's typed words, Waggle's answers, Save / Not quite cards, fixes,
-- changes to earlier answers, feedback sent, and each waiting customer's outcome (ids and
-- outcomes only). Leaving step 3 and coming back restores the whole thread from here. It can hold
-- what the owner typed (their business facts), so it's kept only until setup is finished + 30
-- days: a daily job clears it, and the app ignores it past that even before the job runs.

alter table public.tenants add column setup_chat_log jsonb;

select cron.schedule(
  'purge-setup-chat-log',
  '17 3 * * *',
  $$update public.tenants set setup_chat_log = null
    where setup_chat_log is not null and setup_done_at < now() - interval '30 days'$$
);
