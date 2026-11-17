-- Photos and videos an owner adds for a post they're writing with an AI assistant (MCP, design
-- "AI assistants · Add photos from a chat", approved 17 Nov). A photo dropped into a chat has no
-- link the assistant can pass on, so create_upload_link opens this upload: the owner adds files
-- on Waggle's page (straight to Zernio's storage), then preview_post takes them by upload_id.
-- The id is the link's secret; 30 minutes; only the person (and assistant) who asked can use it.
create table public.media_uploads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  -- [{ url, type, name, size }] in the order added, at most 10.
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  done_at timestamptz
);

create index media_uploads_tenant_created on public.media_uploads (tenant_id, created_at desc);

alter table public.media_uploads enable row level security;

create policy "no oauth clients" on public.media_uploads as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- Per-platform choices on a previewed post (post type, first comment, title, Pinterest board).
alter table public.post_previews add column options jsonb not null default '{}'::jsonb
  check (jsonb_typeof(options) = 'object');

-- A purged brand's uploads go with it, like its previews.
create or replace function private.forget_purged_previews()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_previews where tenant_id = new.id;
  delete from public.media_uploads where tenant_id = new.id;
  return new;
end;
$$;
