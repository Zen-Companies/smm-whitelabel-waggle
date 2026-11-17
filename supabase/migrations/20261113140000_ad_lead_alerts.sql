-- T78d: a lead from an ad's form (Zernio `lead.received`) emails the brand's people and shows in
-- the bell. The webhook mapping queues one 'ad_lead' alert per lead (dedupe_key
-- 'ad_lead:<Meta leadgen id>'); the job reads the lead's answers from the stored webhook event
-- (details.eventId), so no answers are copied into alerts or notifications (rule 10).
alter table public.alerts drop constraint alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check
  check (kind in ('escalation', 'lead', 'disconnect', 'draft_waiting', 'ad_lead'));

-- Same as before, plus 'ad_lead' → the 'lead' notification.
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
