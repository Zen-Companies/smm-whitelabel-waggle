-- DraftResult.needsHuman (docs/tdd.md §8, §10): the knowledge base doesn't cover the question.
-- policy() escalates such drafts (§11 step 3). Written by the draft step (T9).
alter table public.drafts
  add column needs_human boolean not null default false,
  add column needs_human_reason text;
