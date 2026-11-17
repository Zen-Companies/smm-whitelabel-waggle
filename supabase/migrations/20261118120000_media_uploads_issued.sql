-- Security review (17 Nov) of the Add photos page: record which upload links the server handed
-- out, cap them, and add files atomically, so the page only saves files it issued (never another
-- tenant's media link), can't be used to hand out unlimited uploads, and two tabs can't lose or
-- overfill files.
alter table public.media_uploads add column issued jsonb not null default '[]'::jsonb
  check (jsonb_typeof(issued) = 'array');

-- One more upload link for this upload, if it's still open and under `p_max` links issued.
create function public.media_upload_issue(p_id uuid, p_url text, p_max int)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.media_uploads
    set issued = issued || jsonb_build_array(p_url)
    where id = p_id and done_at is null and expires_at > now()
      and jsonb_array_length(issued) < p_max
    returning 1
  )
  select exists (select 1 from u);
$$;

-- Adds one file, only if its link was issued for this upload, it isn't there yet and there's room.
create function public.media_upload_add_file(p_id uuid, p_file jsonb, p_max int)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.media_uploads
    set files = files || jsonb_build_array(p_file)
    where id = p_id and done_at is null and expires_at > now()
      and issued @> jsonb_build_array(p_file ->> 'url')
      and not files @> jsonb_build_array(jsonb_build_object('url', p_file ->> 'url'))
      and jsonb_array_length(files) < p_max
    returning 1
  )
  select exists (select 1 from u);
$$;

revoke all on function public.media_upload_issue(uuid, text, int) from public, anon, authenticated;
revoke all on function public.media_upload_add_file(uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.media_upload_issue(uuid, text, int) to service_role;
grant execute on function public.media_upload_add_file(uuid, jsonb, int) to service_role;
