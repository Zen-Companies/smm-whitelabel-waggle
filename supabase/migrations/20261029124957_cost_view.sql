-- T17 cost view (PRD F14): AI cost per tenant and per message. Operator-only (service role).

-- Per tenant since p_since: messages received, AI calls, AI cost, replies sent.
create function public.cost_by_tenant(p_since timestamptz)
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
    (select count(*) from public.ai_usage u where u.tenant_id = t.id and u.created_at >= p_since),
    coalesce((select sum(u.cost_usd) from public.ai_usage u where u.tenant_id = t.id and u.created_at >= p_since), 0)
  from public.tenants t
  order by 7 desc, t.name;
$$;

-- Per message since p_since: the AI calls behind each item (classify, embed, draft).
create function public.cost_by_item(p_since timestamptz, p_limit int default 50)
returns table (
  item_id uuid,
  tenant_id uuid,
  tenant_name text,
  kind text,
  status text,
  category text,
  received_at timestamptz,
  ai_calls bigint,
  ai_cost_usd numeric,
  purposes text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.tenant_id, t.name, i.kind, i.status, i.category, i.received_at,
    count(u.id), coalesce(sum(u.cost_usd), 0),
    coalesce(array_agg(distinct u.purpose) filter (where u.purpose is not null), '{}')
  from public.inbound_items i
  join public.tenants t on t.id = i.tenant_id
  left join public.ai_usage u on u.item_id = i.id
  where i.received_at >= p_since
  group by i.id, t.name
  order by i.received_at desc
  limit p_limit;
$$;

revoke all on function public.cost_by_tenant(timestamptz) from public, anon, authenticated;
revoke all on function public.cost_by_item(timestamptz, int) from public, anon, authenticated;
grant execute on function public.cost_by_tenant(timestamptz) to service_role;
grant execute on function public.cost_by_item(timestamptz, int) to service_role;
