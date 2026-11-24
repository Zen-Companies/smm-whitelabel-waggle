-- Walter's GHL referral campaign (24 Nov): Black Friday and "give a month, get a month" both run
-- through Tuesday 1 December 2026, 11:59 pm Eastern (= 2 December 04:59:59 UTC). Updates the
-- seeded rows (20261124160000_promotions.sql) only where they still hold the seeded end, so an
-- edit made on Staff → Promotions is never overwritten. The change is kept in promotion_changes.

with before as (
  select * from public.promotions
  where (id = 'black-friday-2026' and ends_at = '2026-12-01T04:59:59Z')
     or (id = 'give-a-month' and ends_at is null)
),
changed as (
  update public.promotions p
  set
    ends_at = '2026-12-02T04:59:59Z',
    bar_text = case when p.id = 'black-friday-2026'
      then replace(p.bar_text, 'Choose a plan by Mon 30 Nov, 11:59 pm ET', 'Choose a plan by Tue 1 Dec, 11:59 pm ET')
      else p.bar_text end,
    bar_phone_text = case when p.id = 'black-friday-2026'
      then replace(p.bar_phone_text, 'Ends Mon 30 Nov', 'Ends Tue 1 Dec')
      else p.bar_phone_text end,
    subline = case when p.id = 'black-friday-2026'
      then replace(p.subline, 'Choose any plan by Monday, 30 Nov', 'Choose any plan by Tuesday, 1 Dec')
      else p.subline end,
    -- The last-day face moves to Tuesday 1 December, 00:00 Eastern ("Ends tonight" stays true).
    last_day_starts_at = case when p.id = 'black-friday-2026' and p.last_day_starts_at = '2026-11-30T05:00:00Z'
      then '2026-12-01T05:00:00Z' else p.last_day_starts_at end,
    last_bar_label = case when p.id = 'black-friday-2026' and p.last_bar_label = 'Cyber Monday'
      then 'Last day' else p.last_bar_label end,
    last_day_name_1 = case when p.id = 'black-friday-2026' and p.last_day_name_1 = 'Cyber'
      then 'Last' else p.last_day_name_1 end,
    last_day_name_2 = case when p.id = 'black-friday-2026' and p.last_day_name_2 = 'Monday'
      then 'Day' else p.last_day_name_2 end,
    updated_at = now()
  from before b
  where p.id = b.id
  returning p.*
)
insert into public.promotion_changes (promotion_id, changed_by, action, before, after)
select c.id, null, 'updated', to_jsonb(b), to_jsonb(c)
from changed c join before b on b.id = c.id;
