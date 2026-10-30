-- T26: owners' practice tries are stored like Lab runs (for the daily try limit), but apart from the
-- operator's history.
alter table public.lab_runs
  add column origin text not null default 'operator' check (origin in ('operator', 'owner'));
create index lab_runs_tenant_origin_idx on public.lab_runs (tenant_id, origin, created_at desc);
