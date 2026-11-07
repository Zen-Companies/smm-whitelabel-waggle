-- MCP Phase 4 (docs/mcp/PLAN.md §7): what the staff pages need.

-- 1. Test brands: the only brands the "Try it" playground may act on. Set by staff in SQL (or by
-- `pnpm demo:seed` locally); owners have no update grant on it.
alter table public.tenants add column is_test boolean not null default false;

-- 2. Logins by email and emails by login, for the staff pages (Staff: add by email; Activity and
-- Switches: who). auth.users isn't exposed to the Data API, so these are server-only functions.
create function public.user_emails(p_ids uuid[])
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text from auth.users u where u.id = any (p_ids);
$$;

create function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.user_emails(uuid[]) from public, anon, authenticated;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_emails(uuid[]) to service_role;
grant execute on function public.user_id_by_email(text) to service_role;
