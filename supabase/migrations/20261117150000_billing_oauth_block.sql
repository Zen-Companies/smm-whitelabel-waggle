-- Billing tables (plan_settings, org_billing, reply_top_ups) refuse AI assistants' OAuth tokens
-- like every other RLS table (MCP Phase 2, oauth_block.test.sql). They're server-only already
-- (RLS on, no policies); this keeps the rule uniform.
do $$
declare t text;
begin
  foreach t in array array['plan_settings', 'org_billing', 'reply_top_ups'] loop
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated, anon '
      'using ((select auth.jwt() ->> ''client_id'') is null) '
      'with check ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end
$$;
