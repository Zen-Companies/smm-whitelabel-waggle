-- T16: scheduled account health check and inbox backfill (docs/tdd.md §7.2).
-- When the tenant's accounts were last checked with Zernio's health endpoint (hourly).
alter table public.tenants add column health_checked_at timestamptz;
-- Pull comments received since this time (after a connect, a recovery or a Zernio pause);
-- cleared once the backfill ran.
alter table public.social_accounts add column backfill_from timestamptz;
