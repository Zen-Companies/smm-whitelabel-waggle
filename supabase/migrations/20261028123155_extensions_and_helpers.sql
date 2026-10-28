-- Extensions and shared helpers (docs/tdd.md §5, §13).

create extension if not exists vector with schema extensions;

-- Helpers live outside `public` so PostgREST never exposes them as RPCs.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
