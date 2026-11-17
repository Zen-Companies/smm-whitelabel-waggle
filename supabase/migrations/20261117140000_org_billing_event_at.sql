-- Stripe can deliver subscription events out of order: keep the time of the event the stored
-- subscription came from, and never let an older event overwrite a newer one.
alter table public.org_billing add column stripe_event_at timestamptz;
