-- What each plan includes, changeable on Staff → Plans without a release (Pricing Bible, 18 Nov,
-- agreed by Jason). Null means "the code's default" (src/features/billing/plans.ts); prices stay
-- in Stripe. brands_limit keeps its meaning: null is unlimited.
alter table public.plan_settings
  add column accounts integer check (accounts is null or accounts between 0 and 100),
  add column replies integer check (replies is null or replies between 0 and 100000),
  add column team boolean,
  add column auto_reply boolean,
  add column leads_flagged boolean,
  add column follow_ups boolean,
  add column for_sale boolean;

-- 18 Nov: Solo is one business; Business and Team are unlimited.
update public.plan_settings set brands_limit = 1 where plan = 'solo' and brands_limit is null;
