-- Google reviews (T61) come with a star rating instead of Facebook's recommends / doesn't.
alter table public.inbound_items
  add column review_rating smallint check (review_rating between 1 and 5);
