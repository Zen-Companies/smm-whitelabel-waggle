-- UI pass (docs/design.md section 4): the owner marks an escalated or failed item as handled (they
-- replied on the platform themselves, or nothing is needed), so it leaves "Needs you".
alter table public.inbound_items drop constraint inbound_items_status_check;
alter table public.inbound_items add constraint inbound_items_status_check check (status in (
  'new', 'classified', 'drafted', 'awaiting_approval', 'sending', 'sent', 'rejected', 'ignored',
  'escalated', 'paused', 'failed', 'handled'
));
