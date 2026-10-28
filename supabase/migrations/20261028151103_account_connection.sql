-- Connect accounts (docs/tasks.md T4). Both functions are service role only.

-- Upserts the account from an account.connected event. Zernio gives an account reconnected after
-- its grace period a NEW account id, so within the tenant a known platform + username (case
-- insensitive) is the same account: its row is updated with the new id instead of duplicated.
-- outcome: 'created' | 'existing' (same Zernio id) | 'reconnected' (new id, matched by username)
--          | 'foreign' (the Zernio id belongs to another tenant; nothing changed).
create function public.upsert_connected_account(
  p_tenant_id uuid,
  p_zernio_account_id text,
  p_platform text,
  p_username text
)
returns table (
  account_id uuid,
  outcome text,
  previous_status text,
  previous_zernio_account_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.social_accounts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('accounts:' || p_tenant_id::text, 0));

  select * into v_account from public.social_accounts
  where zernio_account_id = p_zernio_account_id;

  if found then
    if v_account.tenant_id <> p_tenant_id then
      return query select v_account.id, 'foreign'::text, v_account.status, v_account.zernio_account_id;
      return;
    end if;
    update public.social_accounts
      set status = 'active', username = p_username
      where id = v_account.id;
    return query select v_account.id, 'existing'::text, v_account.status, v_account.zernio_account_id;
    return;
  end if;

  select * into v_account from public.social_accounts
  where tenant_id = p_tenant_id
    and platform = p_platform
    and lower(username) = lower(p_username)
  order by created_at
  limit 1;

  if found then
    update public.social_accounts
      set zernio_account_id = p_zernio_account_id, status = 'active', username = p_username
      where id = v_account.id;
    return query select v_account.id, 'reconnected'::text, v_account.status, v_account.zernio_account_id;
    return;
  end if;

  insert into public.social_accounts (tenant_id, zernio_account_id, platform, username, status)
    values (p_tenant_id, p_zernio_account_id, p_platform, p_username, 'active')
    returning * into v_account;
  return query select v_account.id, 'created'::text, null::text, null::text;
end;
$$;

-- Moves one account's items from any of p_from to p_to and writes one audit_log row per item,
-- in a single statement. Called only from features/inbox/status.ts, which owns the transition
-- rules (CLAUDE.md rule 5).
create function public.transition_account_items(
  p_tenant_id uuid,
  p_social_account_id uuid,
  p_from text[],
  p_to text,
  p_reason text
)
returns table (item_id uuid, from_status text)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select i.id, i.status as from_status
    from public.inbound_items i
    where i.tenant_id = p_tenant_id
      and i.social_account_id = p_social_account_id
      and i.status = any (p_from)
    for update
  ),
  moved as (
    update public.inbound_items i
      set status = p_to, next_run_at = null, locked_at = null
      from candidates c
      where i.id = c.id
      returning i.id, c.from_status
  ),
  audited as (
    insert into public.audit_log (tenant_id, item_id, action, actor, details)
    select p_tenant_id, m.id, 'status_changed', 'system',
           jsonb_build_object('from', m.from_status, 'to', p_to, 'reason', p_reason)
    from moved m
  )
  select id, from_status from moved;
$$;

revoke all on function public.upsert_connected_account(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.transition_account_items(uuid, uuid, text[], text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_connected_account(uuid, text, text, text) to service_role;
grant execute on function public.transition_account_items(uuid, uuid, text[], text, text)
  to service_role;
