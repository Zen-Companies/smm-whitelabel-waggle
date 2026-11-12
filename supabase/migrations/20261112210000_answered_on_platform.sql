-- T65: the owner answered on the platform itself (a Google review replied to in Google), so
-- Waggle's waiting draft was dropped. Shown as "You replied on Google" in the inbox.
alter table public.inbound_items add column answered_on_platform_at timestamptz;
