-- Per-platform choices for one post (T63): YouTube's title now, Pinterest's board next. Kept on
-- the post so a scheduled or retried post still carries them when it goes to Zernio.
alter table public.posts
  add column platform_options jsonb not null default '{}'::jsonb
  check (jsonb_typeof(platform_options) = 'object');
