-- T6b (docs/tasks.md): per-tenant fairness. Zernio's rate limit is one budget for every tenant
-- (docs.zernio.com/multi-tenant), and the runner works oldest first, so one tenant's burst could
-- fill every batch. Now a batch takes at most p_per_tenant due items per tenant (oldest first
-- within the tenant, then oldest first overall); the runner claims batches until its deadline,
-- so a big backlog still drains, a few items per tenant per batch.
-- p_statuses: only statuses the runner has a step for (e.g. no `classified` while no LLM is
-- configured); otherwise such items would take the tenant's slots in every batch.
drop function public.claim_items(int);

create function public.claim_items(
  p_limit int,
  p_per_tenant int default 5,
  p_statuses text[] default array['new', 'classified', 'drafted', 'sending']
)
returns table (
  id uuid,
  tenant_id uuid,
  social_account_id uuid,
  kind text,
  status text,
  attempts int,
  account_status text
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select c.id, c.received_at,
           row_number() over (partition by c.tenant_id order by c.received_at, c.id) as rn
    from public.inbound_items c
    where c.status = any (p_statuses)
      and c.status in ('new', 'classified', 'drafted', 'sending')
      and (c.next_run_at is null or c.next_run_at <= now())
      and (c.locked_at is null or c.locked_at < now() - interval '5 minutes')
  ), picked as (
    select i.id
    from public.inbound_items i
    join due d on d.id = i.id
    where d.rn <= p_per_tenant
    order by d.received_at, i.id
    limit p_limit
    for update of i skip locked
  ), claimed as (
    update public.inbound_items i
      set locked_at = now()
      where i.id in (select id from picked)
      returning i.id, i.tenant_id, i.social_account_id, i.kind, i.status, i.attempts
  )
  select c.id, c.tenant_id, c.social_account_id, c.kind, c.status, c.attempts, a.status
  from claimed c
  join public.social_accounts a on a.id = c.social_account_id;
$$;

revoke all on function public.claim_items(int, int, text[]) from public, anon, authenticated;
grant execute on function public.claim_items(int, int, text[]) to service_role;
