-- The post a comment was left on, as Instagram/Facebook link it (Zernio's post.permalink), for the
-- "Open in Instagram" button on messages that need the owner. Null when the event didn't carry it.
alter table public.inbound_items add column permalink text
  check (permalink is null or permalink ~ '^https://');
