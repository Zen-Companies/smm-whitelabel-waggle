-- Review of release #78 (25 Nov). Additive only.
--
-- 1. A referral keeps the terms of the program it was claimed under. Switching the referral
--    promotion off on Staff → Promotions (or changing its months or days) no longer takes away a
--    month already earned: the referrer's reward months and the friend's free days are stored on
--    the referral row when the friend signs up, and crediting and the friend's checkout read them.
--    0 means no program was running at sign-up (nothing owed, no free month). null only on rows
--    from before this migration that the backfill below couldn't place (the code falls back).
alter table public.referrals
  add column reward_months integer check (reward_months between 0 and 12),
  add column trial_days integer check (trial_days between 0 and 730);

-- Backfill from the promotion's current values: the referral program whose dates held the
-- sign-up (whether it is switched on now or not: these were claimed while it ran). A row outside
-- its dates gets 0 (as the code decided before). No referral promotion stored at all: the code's
-- defaults (1 month, 30 days).
update public.referrals r
set reward_months = coalesce(p.reward_months, 0),
    trial_days = coalesce(p.trial_days, 0)
from (
  select r2.id as referral_id, p2.reward_months, p2.trial_days
  from public.referrals r2
  left join lateral (
    select x.reward_months, x.trial_days
    from public.promotions x
    where x.kind = 'referral'
      and (x.starts_at is null or r2.created_at >= x.starts_at)
      and (x.ends_at is null or r2.created_at <= x.ends_at)
    order by x.created_at
    limit 1
  ) p2 on true
) p
where p.referral_id = r.id
  and r.reward_months is null
  and exists (select 1 from public.promotions where kind = 'referral');

update public.referrals
set reward_months = 1, trial_days = 30
where reward_months is null
  and not exists (select 1 from public.promotions where kind = 'referral');

-- 2. Trials started before org_billing.trial_days existed (23 Nov) have it null, and Your plan
--    read that as the 30-day free month. Their length, where we can tell: from the first audit row
--    that saw the subscription trialing (about when the trial started) to trial_ends_at. Else 7:
--    the trial before the free month.
update public.org_billing b
set trial_days = coalesce(
  (
    select greatest(1, least(730, round(extract(epoch from (b.trial_ends_at - a.created_at)) / 86400)))::int
    from public.audit_log a
    join public.tenants t on t.id = a.tenant_id
    where t.organization_id = b.organization_id
      and a.action = 'billing.subscription'
      and a.details ->> 'status' = 'trialing'
      and a.created_at <= b.trial_ends_at
    order by a.created_at
    limit 1
  ),
  7
)
where b.trial_days is null
  and b.trial_ends_at is not null;

-- 3. The Owner's time zone (QA, 25 Nov): a trial ending 18:35 UTC on December 24 is charged on
--    December 25 in Manila, as Stripe says. Your plan shows dates in the viewer's own zone; the
--    reminder email and HighLevel's waggle_trial_ends use this one, the zone of the browser that
--    started the checkout. null: not known (older bills): UTC for the email, US Eastern for
--    HighLevel, as before.
alter table public.org_billing add column time_zone text check (char_length(time_zone) <= 64);
