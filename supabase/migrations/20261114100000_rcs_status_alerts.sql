-- T83b: an RCS agent moving to a status the owner acts on (Zernio `rcs.agent.status_updated`:
-- changes asked for, ready to test, live, not approved) emails the brand's owners and admins and
-- shows in the bell. One alert per event (dedupe_key 'rcs_status:<event id>'); details hold the
-- agent id, the status and the review note (the partner's words, never customer text).
alter table public.alerts drop constraint alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check
  check (kind in ('escalation', 'lead', 'disconnect', 'draft_waiting', 'ad_lead', 'rcs_status'));

-- Same as before, plus 'rcs_status' → the 'account' notification.
create or replace function private.notify_from_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications
    (tenant_id, kind, needs_action, item_id, social_account_id, details, dedupe_key)
  values (
    new.tenant_id,
    case new.kind
      when 'lead' then 'lead'
      when 'ad_lead' then 'lead'
      when 'escalation' then 'needs_you'
      when 'disconnect' then 'account'
      when 'rcs_status' then 'account'
      else 'replies_waiting'
    end,
    true,
    new.item_id,
    new.social_account_id,
    new.details || jsonb_build_object('alertId', new.id, 'leadId', new.lead_id),
    'alert:' || new.id
  )
  on conflict (dedupe_key) do nothing;
  return null;
end;
$$;
