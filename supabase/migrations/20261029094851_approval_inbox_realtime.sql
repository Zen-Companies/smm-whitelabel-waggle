-- T11 approval inbox: the inbox page listens for draft and item changes (docs/tdd.md §7.3).
-- postgres_changes respects RLS, so an owner only receives their own tenant's rows
-- ("members read their tenant" policies, T1).
alter publication supabase_realtime add table public.drafts, public.inbound_items;
