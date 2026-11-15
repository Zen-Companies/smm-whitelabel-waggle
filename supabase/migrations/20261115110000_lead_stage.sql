-- T74d (design "4 · Leads"): where a lead stands on the Leads board. Null means "not moved by
-- hand": the board shows it as New until someone replied, then Talking. The owner moves it on to
-- Booked or Done. Written by the server (service role) after a role check; members read it.
alter table public.leads
  add column stage text check (stage in ('new', 'talking', 'booked', 'done')),
  add column stage_changed_at timestamptz;
