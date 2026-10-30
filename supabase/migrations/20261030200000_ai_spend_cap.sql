-- T32 (docs/tdd.md §19): a monthly AI spend cap per business. null means the default
-- (AI_MONTHLY_CAP_USD). Only the operator sets it (service role); owners have no update grant.
alter table public.tenants
  add column ai_monthly_cap_usd numeric(10, 2) check (ai_monthly_cap_usd >= 0);

-- What each business has spent on AI since p_since: live and practice calls, never lab.
-- p_tenant_id null: every business.
create function public.ai_spend_since(p_since timestamptz, p_tenant_id uuid default null)
returns table (tenant_id uuid, spent_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
    coalesce((select sum(u.cost_usd) from public.ai_usage u
      where u.tenant_id = t.id and u.created_at >= p_since and u.source <> 'lab'), 0)
  from public.tenants t
  where p_tenant_id is null or t.id = p_tenant_id;
$$;

revoke all on function public.ai_spend_since(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.ai_spend_since(timestamptz, uuid) to service_role;
