-- Plan settings staff can change without a release (Pricing Bible; decided 17 Nov): how many
-- brands each plan includes. Null means no limit. Not a tenant table: one row per plan, read and
-- written by the server only (RLS on, no policies). Who changed it and when live on the row.
create table public.plan_settings (
  plan text primary key check (plan in ('solo', 'business', 'team')),
  brands_limit integer check (brands_limit is null or brands_limit >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.plan_settings enable row level security;

insert into public.plan_settings (plan) values ('solo'), ('business'), ('team');
