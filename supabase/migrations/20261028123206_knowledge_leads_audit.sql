-- Knowledge base, autonomy settings, leads, audit log, AI usage (docs/tdd.md §5).

create table public.kb_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  content text not null,
  -- Dimension and the HNSW index come with the embedding model choice in T8 (§18).
  embedding extensions.vector
);
create index kb_entries_tenant_id_idx on public.kb_entries (tenant_id);

create trigger kb_entries_set_updated_at
  before update on public.kb_entries
  for each row execute function private.set_updated_at();

create table public.autonomy_settings (
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category text not null check (category in ('faq', 'lead', 'complaint', 'spam', 'unclear')),
  mode text not null check (mode in ('off', 'approve', 'auto')),
  primary key (tenant_id, category)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null,
  name text,
  contact text,
  request text,
  foreign key (item_id, tenant_id)
    references public.inbound_items (id, tenant_id) on delete cascade
);
create index leads_tenant_id_created_at_idx on public.leads (tenant_id, created_at desc);
create index leads_item_id_idx on public.leads (item_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid,
  action text not null,
  -- 'system' or the acting user's id.
  actor text not null,
  details jsonb not null default '{}'::jsonb,
  foreign key (item_id, tenant_id)
    references public.inbound_items (id, tenant_id) on delete cascade
);
create index audit_log_tenant_id_created_at_idx on public.audit_log (tenant_id, created_at desc);
create index audit_log_item_id_idx on public.audit_log (item_id);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid,
  purpose text not null check (purpose in ('classify', 'draft', 'embed')),
  provider text not null,
  model text not null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  foreign key (item_id, tenant_id)
    references public.inbound_items (id, tenant_id) on delete cascade
);
create index ai_usage_tenant_id_created_at_idx on public.ai_usage (tenant_id, created_at desc);
create index ai_usage_item_id_idx on public.ai_usage (item_id);
