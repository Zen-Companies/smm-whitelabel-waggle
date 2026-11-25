-- The Black Friday bar is for never-paid Owners, and give a month, get a month is for paying
-- Owners only (20261125190000_referral_paying_owners.sql), so the bar no longer says "Give a
-- month, get a month: refer a friend". Only that line is removed; any other text our team wrote
-- on Staff → Promotions stays. Additive only. Logged in promotion_changes (CLAUDE.md rule 11).

with before as (
  select * from public.promotions
  where id = 'black-friday-2026' and bar_text like '%Give a month, get a month: *refer a friend*%'
),
changed as (
  update public.promotions p
  set
    bar_text = btrim(
      replace(
        replace(p.bar_text, E'\nGive a month, get a month: *refer a friend*', ''),
        'Give a month, get a month: *refer a friend*', ''
      ),
      E'\n'
    ),
    updated_at = now()
  from before b
  where p.id = b.id
  returning p.*
)
insert into public.promotion_changes (promotion_id, changed_by, action, before, after)
select c.id, null, 'updated', to_jsonb(b), to_jsonb(c)
from changed c join before b on b.id = c.id;
