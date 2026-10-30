-- The cost view counts what a business costs to run: live and practice calls, not the operator's
-- lab experiments. Same signature, so callers and grants are unchanged.
create or replace function public.cost_by_tenant(p_since timestamptz)
returns table (
  tenant_id uuid,
  tenant_name text,
  zernio_profile_id text,
  messages bigint,
  replies_sent bigint,
  ai_calls bigint,
  ai_cost_usd numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, t.zernio_profile_id,
    (select count(*) from public.inbound_items i where i.tenant_id = t.id and i.received_at >= p_since),
    (select count(*) from public.drafts d where d.tenant_id = t.id and d.status = 'sent' and d.sent_at >= p_since),
    (select count(*) from public.ai_usage u
      where u.tenant_id = t.id and u.created_at >= p_since and u.source <> 'lab'),
    coalesce((select sum(u.cost_usd) from public.ai_usage u
      where u.tenant_id = t.id and u.created_at >= p_since and u.source <> 'lab'), 0)
  from public.tenants t
  order by 7 desc, t.name;
$$;
