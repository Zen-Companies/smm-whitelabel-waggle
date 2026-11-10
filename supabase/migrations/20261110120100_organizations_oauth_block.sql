-- T53: the organization tables refuse AI assistants' OAuth tokens like every other RLS table
-- (MCP Phase 2; supabase/tests/database/oauth_block.test.sql).
do $$
declare
  t text;
begin
  foreach t in array array['organizations', 'organization_members', 'organization_member_brands',
                           'organization_invites', 'organization_audit'] loop
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated, anon '
      'using ((select auth.jwt() ->> ''client_id'') is null) '
      'with check ((select auth.jwt() ->> ''client_id'') is null)',
      t
    );
  end loop;
end
$$;
