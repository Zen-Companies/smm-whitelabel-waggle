-- The Free plan (Jason, 19 Nov 2026): no card, 1 account, 100 AI replies a month, "Ask me first"
-- only, no add-ons. Solo goes to 300 replies with auto-reply; Team (id business) to 6 accounts;
-- Business (id team) is by call only, so off sale. Defaults live in src/features/billing/plans.ts;
-- these rows are what Staff → Plans changes on top of them (null = the code's default).

-- Free has a row on Staff → Plans like the paid plans (org_billing never stores it: Free is no
-- subscription).
alter table public.plan_settings drop constraint if exists plan_settings_plan_check;
alter table public.plan_settings
  add constraint plan_settings_plan_check check (plan in ('free', 'solo', 'business', 'team'));

alter table public.plan_settings_changes drop constraint if exists plan_settings_changes_plan_check;
alter table public.plan_settings_changes
  add constraint plan_settings_changes_plan_check check (plan in ('free', 'solo', 'business', 'team'));

insert into public.plan_settings (plan, brands_limit) values ('free', 1) on conflict (plan) do nothing;

-- Solo: 300 replies (was 200) and replies on its own, unless staff already set something else.
update public.plan_settings
set replies = 300, updated_at = now()
where plan = 'solo' and (replies is null or replies = 200);
update public.plan_settings
set auto_reply = true, updated_at = now()
where plan = 'solo' and (auto_reply is null or auto_reply = false);

-- Team (id business): 6 accounts (was 4).
update public.plan_settings
set accounts = 6, updated_at = now()
where plan = 'business' and (accounts is null or accounts = 4);

-- Business (id team): by call only. Anyone already on the $199 price keeps it (Stripe).
update public.plan_settings set for_sale = false, updated_at = now() where plan = 'team';
