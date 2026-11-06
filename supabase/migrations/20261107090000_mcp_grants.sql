-- MCP Phase 2 (docs/mcp/PLAN.md §4): AI assistants sign in through Supabase's OAuth 2.1 server.

-- 1. Which brands a user shared with each AI assistant (one row per user and OAuth client),
-- chosen on our consent page and changed in Settings → AI assistants. The MCP server checks it on
-- every call, so a change or a disconnect applies at once (a token alone is never enough).
create table public.mcp_grants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 200),
  client_name text not null default '' check (char_length(client_name) <= 200),
  tenant_ids uuid[] not null default '{}',
  unique (user_id, client_id)
);
create index mcp_grants_user_id_idx on public.mcp_grants (user_id);

alter table public.mcp_grants enable row level security;
-- The owner sees their own connections (Settings); every write goes through the service role
-- after the server checked the session and the brands.
create policy "users read their own grants" on public.mcp_grants
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.mcp_grants to authenticated;
grant all on public.mcp_grants to service_role;

-- 2. An OAuth access token is a normal Supabase JWT (plus a client_id claim), so it would also
-- work against the Data API and Realtime with the public anon key, reaching every brand the user
-- owns and skipping the MCP server's brand check and audit. A restrictive policy on every table
-- refuses such tokens; AI assistants only reach data through /api/mcp (service role, after its
-- own checks). supabase/tests/database/oauth_block.test.sql keeps new tables from missing it.
do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public' and rowsecurity
  loop
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated, anon '
      'using ((select auth.jwt() ->> ''client_id'') is null) '
      'with check ((select auth.jwt() ->> ''client_id'') is null)',
      t.tablename
    );
  end loop;
end
$$;
