-- AI assistants on by default (18 Nov): a brand is on unless staff switch it off in its row
-- (features/mcp/flags.ts). Every brand switched off so far is switched on, once, and logged.
with switched as (
  update public.feature_flags
     set enabled = true
   where key = 'mcp' and tenant_id is not null and enabled = false
  returning tenant_id
)
insert into public.audit_log (tenant_id, action, actor, details)
select tenant_id, 'ai_assistants_switched_on', 'system', '{"reason": "on by default"}'::jsonb
  from switched;
