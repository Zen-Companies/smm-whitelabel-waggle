-- T27 (docs/tdd.md §19): the owner's "Pause all replies" switch. While on, policy() sends nothing
-- on its own (auto mode waits for approval) and the send step holds approved replies until it's
-- off again. Statuses are not changed by the switch itself.
alter table public.tenants add column replies_paused boolean not null default false;

grant update (replies_paused) on public.tenants to authenticated;
