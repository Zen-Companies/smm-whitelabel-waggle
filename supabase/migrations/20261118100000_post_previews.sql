-- AI assistants post in two steps (MCP, 17 Nov): preview_post stores exactly what would go out
-- and returns its id as a one-time confirmation code; create_post publishes that stored post and
-- nothing else, once, within 30 minutes. So wording the owner never saw can't be published, and
-- the assistant can't change anything between the preview and the post.
-- Server-only: RLS on, no policies, and AI assistants' tokens refused like every RLS table.
create table public.post_previews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  -- The AI assistant (OAuth client) that asked for it; only the same one can confirm it.
  client_id text not null,
  content text not null,
  account_ids uuid[] not null check (cardinality(account_ids) between 1 and 10),
  -- [{ url, type, alt_text }]: public links Zernio fetches (checked when previewed).
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  publish_mode text not null check (publish_mode in ('now', 'at', 'queue')),
  publish_at timestamptz,
  youtube_title text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  post_id uuid references public.posts (id) on delete set null,
  constraint publish_at_when_scheduled check ((publish_mode = 'at') = (publish_at is not null))
);

create index post_previews_tenant_created on public.post_previews (tenant_id, created_at desc);

alter table public.post_previews enable row level security;

create policy "no oauth clients" on public.post_previews as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
