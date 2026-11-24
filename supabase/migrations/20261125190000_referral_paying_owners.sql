-- Give a month, get a month is for paying Owners only (Pricing Bible: "A paying customer sends a
-- friend their link ... Both sides need a card on a paid plan"). Additive only.
--
-- A new bar audience, 'paying_owners' (Owners whose organization has a live paid plan with its
-- card), and the referral program's bar moves to it from 'all_owners' (unless our team already
-- picked another audience on Staff → Promotions). Logged in promotion_changes (CLAUDE.md rule 11).

alter table public.promotions drop constraint promotions_audience_check;
alter table public.promotions add constraint promotions_audience_check
  check (audience in ('never_paid_owners', 'paying_owners', 'all_owners', 'everyone'));

with before as (
  select * from public.promotions where kind = 'referral' and audience = 'all_owners'
),
changed as (
  update public.promotions p
  set audience = 'paying_owners', updated_at = now()
  from before b
  where p.id = b.id
  returning p.*
)
insert into public.promotion_changes (promotion_id, changed_by, action, before, after)
select c.id, null, 'updated', to_jsonb(b), to_jsonb(c)
from changed c join before b on b.id = c.id;
