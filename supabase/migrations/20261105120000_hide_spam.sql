-- T40 (docs/tdd.md §11): spam comments are hidden on Instagram/Facebook, not just in Waggle.
-- auto_hide_spam: the owner's "Hide spam comments for me" switch (Settings → Replies), off by
-- default. hidden_on_platform_at: when the comment was hidden on its post (null = visible);
-- written by the service role only (job step and owner actions), read with the item.
alter table public.tenants add column auto_hide_spam boolean not null default false;
grant update (auto_hide_spam) on public.tenants to authenticated;

alter table public.inbound_items add column hidden_on_platform_at timestamptz;
