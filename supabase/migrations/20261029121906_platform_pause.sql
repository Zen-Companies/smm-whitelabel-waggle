-- T19: Zernio 402 PAYMENT_REQUIRED pauses the whole Zernio team (every tenant, reads included;
-- docs.zernio.com/multi-tenant). It is platform state, not an item failure: sending waits, the
-- operator is told once, nothing is escalated to owners. One row per key; server-only.
create table public.platform_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.platform_state enable row level security;
-- No client grants (default privileges are revoked): read and written by the server only.
