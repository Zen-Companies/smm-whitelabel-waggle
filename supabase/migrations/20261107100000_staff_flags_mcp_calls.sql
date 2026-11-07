-- MCP Phase 3 (docs/mcp/PLAN.md §5.3, §7): staff roles, feature switches, the MCP activity log.

-- 1. Staff (Zen Companies people, not business owners): a role per login, and what each role may
-- do. Replaces the `operator` role in app_metadata (T34). Read and written only by the server.
create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'developer', 'support', 'viewer')),
  created_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null
);

create table public.staff_role_permissions (
  role text not null check (role in ('admin', 'developer', 'support', 'viewer')),
  permission text not null,
  primary key (role, permission)
);

insert into public.staff_role_permissions (role, permission) values
  ('admin', 'admin.costs.view'), ('admin', 'admin.lab.use'), ('admin', 'mcp.docs.view'),
  ('admin', 'mcp.playground.run'), ('admin', 'mcp.audit.view'), ('admin', 'flags.manage'),
  ('admin', 'staff.manage'), ('admin', 'admin.caps.manage'),
  ('developer', 'admin.costs.view'), ('developer', 'admin.lab.use'), ('developer', 'mcp.docs.view'),
  ('developer', 'mcp.playground.run'), ('developer', 'mcp.audit.view'),
  ('support', 'mcp.docs.view'), ('support', 'mcp.audit.view'),
  ('viewer', 'admin.costs.view'), ('viewer', 'mcp.docs.view'), ('viewer', 'mcp.audit.view');

-- Today's operators become admins.
insert into public.staff_members (user_id, role)
select id, 'admin' from auth.users where raw_app_meta_data ->> 'role' = 'operator'
on conflict (user_id) do nothing;

-- 2. Feature switches: one row per key, globally (tenant_id null) or for one brand.
create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_.]{0,63}$'),
  tenant_id uuid references public.tenants (id) on delete cascade,
  enabled boolean not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index feature_flags_key_tenant_idx
  on public.feature_flags (key, coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'));

-- A brand's daily limit for AI-assistant sends; null = the default (MCP_DAILY_SEND_CAP).
alter table public.tenants
  add column mcp_daily_send_cap integer check (mcp_daily_send_cap between 1 and 10000);

-- 3. Every MCP tool call: who, which brand, which assistant, the outcome and how long it took.
-- `args` never holds free text (rule 10): ids, numbers and choices only. Rate limits count here.
create table public.mcp_calls (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  client_name text not null default '',
  tenant_id uuid references public.tenants (id) on delete cascade,
  tool text not null,
  kind text not null check (kind in ('read', 'act', 'send')),
  status text not null default 'running' check (status in ('running', 'ok', 'error', 'rejected')),
  error_code text,
  latency_ms integer,
  args jsonb not null default '{}',
  playground boolean not null default false
);
create index mcp_calls_user_client_at_idx on public.mcp_calls (user_id, client_id, at desc);
create index mcp_calls_user_at_idx on public.mcp_calls (user_id, at desc);
create index mcp_calls_tenant_kind_at_idx on public.mcp_calls (tenant_id, kind, at desc);
create index mcp_calls_at_idx on public.mcp_calls (at desc);

-- RLS on, no policies: the service role only. OAuth tokens are refused as on every table.
alter table public.staff_members enable row level security;
alter table public.staff_role_permissions enable row level security;
alter table public.feature_flags enable row level security;
alter table public.mcp_calls enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['staff_members', 'staff_role_permissions', 'feature_flags', 'mcp_calls']
  loop
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated, anon '
      'using ((select auth.jwt() ->> ''client_id'') is null) '
      'with check ((select auth.jwt() ->> ''client_id'') is null)',
      t
    );
    execute format('grant all on public.%I to service_role', t);
  end loop;
end
$$;
