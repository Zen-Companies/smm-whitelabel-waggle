-- T24 (docs/tdd.md §19): the Lab's labeled test cases and saved runs. Operator pages and owner
-- practice write them through the service role after an auth check; no client grants.

-- A message with its correct category, in a named set ("Harbour Bean", "Digital products").
-- origin: added by the operator in the Lab, or an owner's correction in the practice box (T26).
create table public.lab_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  set_name text not null check (char_length(set_name) between 1 and 60),
  text text not null check (char_length(text) between 1 and 2000),
  kind text not null check (kind in ('comment', 'dm')),
  expected_category text not null
    check (expected_category in ('faq', 'lead', 'complaint', 'spam', 'unclear')),
  origin text not null default 'operator' check (origin in ('operator', 'owner')),
  created_by uuid references auth.users (id) on delete set null
);
create index lab_cases_tenant_set_idx on public.lab_cases (tenant_id, set_name);

-- One Lab run: the message and both variants' results (ids, scores, drafts; shown back only).
create table public.lab_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('comment', 'dm')),
  text text not null check (char_length(text) between 1 and 2000),
  results jsonb not null
);
create index lab_runs_created_idx on public.lab_runs (created_at desc);

alter table public.lab_cases enable row level security;
alter table public.lab_runs enable row level security;
