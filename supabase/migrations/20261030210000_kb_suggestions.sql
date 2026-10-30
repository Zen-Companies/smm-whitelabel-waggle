-- T33 (docs/tdd.md §19): the business-info gap helper, the first agent. Its calls are recorded in
-- ai_usage as purpose 'agent'; its suggestions wait here for the owner.
alter table public.ai_usage drop constraint ai_usage_purpose_check;
alter table public.ai_usage
  add constraint ai_usage_purpose_check check (purpose in ('classify', 'draft', 'embed', 'agent'));

-- A topic the helper suggests from questions the business info didn't answer. `content` is wording
-- with [...] blanks where the owner's facts go: the helper never writes a fact (CLAUDE.md rule 8).
-- Pending until the owner saves it as a topic (accepted) or dismisses it.
create table public.kb_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content text not null default '' check (char_length(content) <= 4000),
  item_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  decided_at timestamptz,
  kb_entry_id uuid references public.kb_entries (id) on delete set null
);
create index kb_suggestions_tenant_status_idx on public.kb_suggestions (tenant_id, status, created_at desc);

-- Owners read their own; every write goes through the service role after an auth check.
alter table public.kb_suggestions enable row level security;
create policy "members read their tenant" on public.kb_suggestions
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
