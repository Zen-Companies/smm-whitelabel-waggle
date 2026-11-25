-- Referrals (review of PR #63, 24 Nov): crediting a referrer's month is claimed before Stripe is
-- called, so a credit can never be made twice.
--   crediting  the jobs route claimed the row and is crediting it in Stripe right now
--              (rewarded_at holds when it was claimed; a claim older than 10 minutes is retried,
--              after looking in Stripe for a credit already made for this referral)
--   no_reward  the friend's first payment went through, but no referral program was running when
--              the friend signed up (or it gives 0 months): nothing is owed
alter table public.referrals drop constraint if exists referrals_status_check;
alter table public.referrals add constraint referrals_status_check
  check (status in ('signed_up', 'reward_due', 'crediting', 'rewarded', 'banked', 'no_reward'));

create index if not exists referrals_crediting on public.referrals (rewarded_at) where status = 'crediting';
