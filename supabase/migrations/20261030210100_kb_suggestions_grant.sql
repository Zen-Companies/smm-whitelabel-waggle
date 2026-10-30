-- T33: owners read their business's suggestions through RLS (Business info page). Writes stay with
-- the service role.
grant select on public.kb_suggestions to authenticated;
