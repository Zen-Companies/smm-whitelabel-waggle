-- Setup's AI calls (business profile, setup chat) get their own model slot (LLM_SETUP_MODEL) and
-- are recorded in ai_usage as purpose 'setup'.
alter table public.ai_usage drop constraint ai_usage_purpose_check;
alter table public.ai_usage
  add constraint ai_usage_purpose_check
  check (purpose in ('classify', 'draft', 'embed', 'agent', 'setup'));
