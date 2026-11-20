-- Walter's setup flow (approved 20 Nov, canvas "Walter's flow in Waggle" and "Setup steps 2 and 3,
-- one screen at a time"). Additive only.
--
-- 1. The 3-step setup (Connect · See what you missed · Check Waggle's answers) remembers the screen
--    the owner left, and when it was finished. Written with the service role by the app (no grant
--    to owners), audited (setup_screen_seen, setup_finished).
-- 2. A brand made by the first Connect on /welcome has no real name yet (name_pending): it is
--    named from the connected profile, or setup asks "What's your business called?".
-- 3. "Always ask me" topics from setup's last screen: in auto mode a message about one of them
--    waits for the owner (policy reason ask_first_topic).
-- 4. Response score (decision 5): the catch-up counts the customer messages of the last 30 days
--    it could judge, and how many got an answer within 24 hours.

alter table public.tenants
  add column name_pending boolean not null default false,
  add column setup_screen text
    check (setup_screen in ('name', 'missed', 'wanted', 'replies', 'money', 'quick', 'waiting', 'how')),
  add column setup_done_at timestamptz,
  add column ask_first_topics text[] not null default '{refunds}';

-- Brands already in use never see the new setup line on Today and Teach Waggle.
update public.tenants t
  set setup_done_at = coalesce(t.setup_passed_at, now())
  where t.setup_done_at is null
    and (
      t.setup_passed_at is not null
      or t.is_test
      or exists (select 1 from public.social_accounts s where s.tenant_id = t.id)
    );

alter table public.catch_ups
  add column response_messages integer not null default 0,
  add column response_answered integer not null default 0;
