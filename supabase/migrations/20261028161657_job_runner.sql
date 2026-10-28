-- Job runner (docs/tasks.md T6, docs/tdd.md §7.2, §14). Functions are service role only.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Claims up to p_limit items whose next step is due (TDD §7.2). A lock older than 5 minutes is
-- treated as abandoned (the run that held it died). Returns what the runner needs to decide.
create function public.claim_items(p_limit int)
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
  with claimed as (
    update public.inbound_items i
      set locked_at = now()
      where i.id in (
        select c.id from public.inbound_items c
        where c.status in ('new', 'classified', 'drafted', 'sending')
          and (c.next_run_at is null or c.next_run_at <= now())
          and (c.locked_at is null or c.locked_at < now() - interval '5 minutes')
        order by c.received_at
        limit p_limit
        for update skip locked
      )
      returning i.id, i.tenant_id, i.social_account_id, i.kind, i.status, i.attempts
  )
  select c.id, c.tenant_id, c.social_account_id, c.kind, c.status, c.attempts, a.status
  from claimed c
  join public.social_accounts a on a.id = c.social_account_id;
$$;

-- Moves one item from p_from to p_to (no-op if it isn't in p_from any more), clears the retry
-- state (attempts count per step), and writes its status_changed audit row, in one statement.
-- p_keep_lock keeps the item locked when the runner goes straight on to the next step.
-- Called only from features/inbox/status.ts, which owns the transition rules (rule 5).
create function public.transition_item(
  p_item_id uuid,
  p_from text,
  p_to text,
  p_reason text,
  p_details jsonb default '{}'::jsonb,
  p_keep_lock boolean default false
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with moved as (
    update public.inbound_items
      set status = p_to,
          locked_at = case when p_keep_lock then locked_at else null end,
          next_run_at = null,
          attempts = 0,
          last_error = null
      where id = p_item_id and status = p_from
      returning id, tenant_id
  ),
  audited as (
    insert into public.audit_log (tenant_id, item_id, action, actor, details)
    select m.tenant_id, m.id, 'status_changed', 'system',
           jsonb_build_object('from', p_from, 'to', p_to, 'reason', p_reason) || p_details
    from moved m
  )
  select exists (select 1 from moved);
$$;

revoke all on function public.claim_items(int) from public, anon, authenticated;
revoke all on function public.transition_item(uuid, text, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_items(int) to service_role;
grant execute on function public.transition_item(uuid, text, text, text, jsonb, boolean)
  to service_role;

-- pg_cron → pg_net → /api/jobs/process every minute. The URL and CRON_SECRET live in Supabase
-- Vault (per environment, never in a migration):
--   select vault.create_secret('https://<app>/api/jobs/process', 'job_process_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Without both secrets the tick does nothing. pg_net is asynchronous; its timeout outlasts the
-- route's 60 s maxDuration so the connection isn't dropped mid-run.
create function private.trigger_job_processing()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'job_process_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 65000
  );
end;
$$;

revoke all on function private.trigger_job_processing() from public, anon, authenticated;

select cron.schedule('process-inbound-items', '* * * * *', 'select private.trigger_job_processing()');
