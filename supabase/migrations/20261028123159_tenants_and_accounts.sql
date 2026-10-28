-- Tenants, members, social accounts, posts, webhook events (docs/tdd.md §4, §5).
-- Child tables reference parents by (id, tenant_id) so a row can never point at another tenant's row.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  zernio_profile_id text unique,
  stripe_customer_id text unique,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  confidence_threshold numeric(3, 2) not null default 0.85
    check (confidence_threshold between 0 and 1)
);

create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner')),
  unique (tenant_id, user_id)
);
create index tenant_members_user_id_idx on public.tenant_members (user_id);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  zernio_account_id text not null unique,
  platform text not null check (platform in ('instagram', 'facebook')),
  username text,
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  unique (id, tenant_id)
);
create index social_accounts_tenant_id_idx on public.social_accounts (tenant_id);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  content text not null,
  media jsonb not null default '[]'::jsonb,
  target_account_ids uuid[] not null default '{}',
  scheduled_for timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'partial', 'failed', 'cancelled')),
  zernio_post_id text unique,
  idempotency_key text not null unique default gen_random_uuid()::text,
  last_error text
);
create index posts_tenant_id_created_at_idx on public.posts (tenant_id, created_at desc);

-- A uuid[] can't carry a foreign key: every target account must belong to the post's tenant (§4).
create function private.check_post_target_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(new.target_account_ids) as t (account_id)
    where not exists (
      select 1 from public.social_accounts s
      where s.id = t.account_id and s.tenant_id = new.tenant_id
    )
  ) then
    raise exception 'target_account_ids must belong to the post''s tenant'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger posts_check_target_accounts
  before insert or update of target_account_ids, tenant_id on public.posts
  for each row execute function private.check_post_target_accounts();

-- Not a tenant table: events are deduped before the tenant is known. Service role only.
create table public.webhook_events (
  id text primary key,
  source text not null check (source in ('zernio', 'stripe')),
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
