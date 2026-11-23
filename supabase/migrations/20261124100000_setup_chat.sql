-- Step 3 is a conversation with Waggle (board "Step 3 is a conversation with Waggle", approved
-- 23 Nov). Additive only; RLS unchanged (tenants already has it). Written with the service role
-- by the app after its role check, so no new column grants to owners.
--
-- 1. setup_chat: the owner's answers in the thread, saved as they're tapped (kind picked, facts
--    confirmed, replies sent or skipped, need-you done, reply choice), so a reload brings the
--    thread back. Ids and choices only: never customer text.
-- 2. ai_profile: the business profile Waggle makes once per brand when the 30-day read is sorted
--    (one AI call, zod-checked): a guessed kind, what customers want (labels and their words),
--    facts to confirm, ask-first suggestions and urgent words. The safety floor (refunds and
--    complaints, medical questions, gas or electrical safety, emergencies) is code, applied when
--    read, never stored here. ai_profile_at claims the one call.
-- 3. setup_screen gains 'chat' (step 3's one screen); the old step 3 screens stay valid so old
--    rows and links keep working (they open the chat).

alter table public.tenants
  add column setup_chat jsonb not null default '{}'::jsonb,
  add column ai_profile jsonb,
  add column ai_profile_at timestamptz;

alter table public.tenants drop constraint if exists tenants_setup_screen_check;
alter table public.tenants
  add constraint tenants_setup_screen_check
    check (setup_screen in ('name', 'missed', 'wanted', 'replies', 'money', 'quick', 'waiting', 'how', 'chat'));
