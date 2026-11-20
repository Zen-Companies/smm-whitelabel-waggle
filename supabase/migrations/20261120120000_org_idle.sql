-- Free plan (decided 19 Nov): a Free organization nobody signs in to for 30 days has its social
-- accounts disconnected (each costs Waggle $1-6 a month). One warning email at day 23, the
-- disconnect at day 30, and a note on Today when they come back. Paid plans never disconnect.
-- Organization rows, not brand rows: written only by the server (the jobs route, and the Today
-- note's Dismiss through a server action). RLS on, no policies: the browser never reads it.

create table public.org_idle (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- The last daily check (the jobs route checks each organization at most once a day).
  checked_at timestamptz,
  -- The last time anyone in the organization used Waggle, as of that check.
  last_active_at timestamptz,
  -- The day-23 warning: when it was sent, and the stretch away it belongs to (last_active_at at
  -- the time). Someone coming back (a later last_active_at) clears it.
  warned_at timestamptz,
  warned_for_active_at timestamptz,
  disconnect_on timestamptz,
  -- The day-30 disconnect, for the note on Today; Dismiss hides it.
  disconnected_at timestamptz,
  disconnected_account_ids uuid[] not null default '{}',
  notice_dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.org_idle enable row level security;
create policy "no oauth clients" on public.org_idle as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- Organizations due a check: open, with at least one connected account on an open brand, and
-- not checked in the last day (never-checked first). Service role only.
create function public.idle_check_candidates(p_checked_before timestamptz, p_limit integer)
returns table (organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.organizations o
  left join public.org_idle s on s.organization_id = o.id
  where o.closed_at is null
    and (s.checked_at is null or s.checked_at < p_checked_before)
    and exists (
      select 1 from public.tenants t
      join public.social_accounts a on a.tenant_id = t.id
      where t.organization_id = o.id and t.offboarded_at is null and a.status = 'active'
    )
  order by s.checked_at nulls first, o.id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.idle_check_candidates(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.idle_check_candidates(timestamptz, integer) to service_role;
