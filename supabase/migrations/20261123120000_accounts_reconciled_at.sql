-- Setup's connecting screen (approved 23 Nov). Additive.
--
-- When the account.connected webhook seems lost, /api/setup/connected may ask Zernio for the
-- brand's accounts. This is when it last did, so a brand asks at most once every 15 seconds
-- however many tabs or requests poll (claimed with a conditional update). Written with the
-- service role only. Kept apart from health_checked_at, which paces the hourly health check.

alter table public.tenants add column accounts_reconciled_at timestamptz;
