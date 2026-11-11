-- Help & feedback (design v3 "Beta access and feedback"): notes and page ratings people send from
-- any page, kept for "Your requests" and forwarded to GHL; and which nudges each person has seen.
-- Service role only (the app reads a login's own rows on the server).

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('note', 'rating')),
  -- A note: the optional type, the message and the answer to the type's one open question.
  type text check (type in ('idea', 'problem', 'question', 'love')),
  message text not null default '' check (char_length(message) <= 4000),
  follow_up text not null default '' check (char_length(follow_up) <= 2000),
  contact_ok boolean not null default true,
  -- A rating: good or not good, and an optional reason.
  rating text check (rating in ('good', 'not_good')),
  reason text not null default '' check (char_length(reason) <= 500),
  page text not null check (char_length(page) <= 200),
  organization_id uuid references public.organizations (id) on delete set null,
  tenant_id uuid references public.tenants (id) on delete set null,
  sent_to_ghl_at timestamptz,
  constraint note_or_rating check (
    (kind = 'note' and char_length(btrim(message)) > 0 and rating is null)
    or (kind = 'rating' and rating is not null))
);
create index feedback_user_created_idx on public.feedback (user_id, created_at desc);

create table public.feedback_nudges (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{1,40}$'),
  shown_at timestamptz not null default now(),
  outcome text check (outcome in ('opened', 'dismissed')),
  primary key (user_id, key)
);

alter table public.feedback enable row level security;
alter table public.feedback_nudges enable row level security;
grant all on public.feedback, public.feedback_nudges to service_role;
do $$
declare
  t text;
begin
  foreach t in array array['feedback', 'feedback_nudges'] loop
    execute format(
      'create policy "no oauth clients" on public.%I as restrictive for all to authenticated, anon '
      'using ((select auth.jwt() ->> ''client_id'') is null) '
      'with check ((select auth.jwt() ->> ''client_id'') is null)', t);
  end loop;
end
$$;
