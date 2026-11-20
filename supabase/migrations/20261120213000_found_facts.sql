-- Walter's flow, build C (decision 7, 20 Nov): facts Waggle finds on a newly connected account
-- (the Facebook Page's info, the Instagram bio, post captions) are saved as business info marked
-- "not checked". Auto-reply never sends a draft that used one (policy reason facts_unchecked);
-- the owner checks it with the Check button in Business info, by editing it, or by sending a
-- reply that uses it (audit found_fact_checked). Additive only; RLS unchanged.
--
-- Owners keep their column grants (insert/update title and content only), so they can't mark an
-- entry checked through the API: the Check action does it with the service role after the role
-- check, and writes the audit row.
--
-- There is no structured business profile (tenants.business_profile is one owner-written text
-- for the classifier), so found hours, address and contact are kb_entries too (found_kind), and
-- the same not-checked rule covers them.

alter table public.kb_entries
  add column needs_check boolean not null default false,
  add column checked_at timestamptz,
  add column checked_by uuid references auth.users (id) on delete set null,
  add column found_kind text
    check (found_kind in ('price', 'hours', 'address', 'contact', 'answer')),
  add column found_source text
    check (found_source in ('facebook_page', 'instagram_profile', 'post_caption')),
  add column found_catch_up_id uuid references public.catch_ups (id) on delete set null;

create index kb_entries_needs_check on public.kb_entries (tenant_id) where needs_check;

-- One extraction per first connect: claimed by setting facts_found_at.
alter table public.catch_ups
  add column facts_found_at timestamptz,
  add column facts_found integer not null default 0;
