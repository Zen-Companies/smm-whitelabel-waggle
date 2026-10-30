-- T23 (docs/tdd.md §19): lab and practice runs are recorded in ai_usage but kept apart from live
-- processing. Lab calls are operator cost; practice calls count toward the business's spend.
alter table public.ai_usage
  add column source text not null default 'live'
  check (source in ('live', 'lab', 'practice'));
