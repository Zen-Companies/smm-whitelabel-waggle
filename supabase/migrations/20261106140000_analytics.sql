-- Analytics (T48): copies of Zernio's numbers, filled by the job. Pages read these, never Zernio
-- (Zernio's multi-tenant guide: analytics share one per-second budget and are cached upstream).

-- Summaries the pages read whole: dashboards per period and platform ('dashboard:30:all'),
-- audience per account ('audience:<social_account_id>'), follower series ('followers'), best
-- times ('best_time'). `data` holds our own shapes (src/lib/social/analytics-types.ts).
create table public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  data jsonb not null,
  synced_at timestamptz not null default now(),
  unique (tenant_id, key)
);

-- One row per post per platform, with its lifetime numbers.
create table public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Zernio's analytics id for the post (the key for its timeline).
  provider_post_id text not null,
  platform text not null,
  -- Set when the post went out through Zernio (Waggle); null for posts made on the platform.
  zernio_post_id text,
  published_at timestamptz,
  caption text not null default '',
  permalink text,
  thumbnail_url text,
  format text not null default 'post',
  is_external boolean not null default false,
  sync_status text not null default 'synced'
    check (sync_status in ('synced', 'pending', 'partial', 'unavailable')),
  reach integer not null default 0,
  impressions integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  clicks integer not null default 0,
  views integer not null default 0,
  engagement_rate numeric(7, 2) not null default 0,
  timeline jsonb,
  timeline_synced_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (tenant_id, provider_post_id, platform)
);
create index post_metrics_tenant_published_idx on public.post_metrics (tenant_id, published_at desc);

-- When each part last synced, so the job picks the tenants that are due.
alter table public.tenants
  add column analytics_synced_at timestamptz,
  add column analytics_full_at timestamptz,
  add column analytics_audience_at timestamptz;

alter table public.analytics_snapshots enable row level security;
alter table public.post_metrics enable row level security;
grant select on public.analytics_snapshots, public.post_metrics to authenticated;
create policy "members read their tenant" on public.analytics_snapshots
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
create policy "members read their tenant" on public.post_metrics
  for select to authenticated using (tenant_id in (select private.user_tenant_ids()));
