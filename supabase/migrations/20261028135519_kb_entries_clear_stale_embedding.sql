-- An edited KB entry must not keep the embedding of its old text: clear it whenever
-- title or content changes. Re-embedding (T8) picks up entries where embedding is null.

create function private.clear_kb_entry_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.embedding := null;
  return new;
end;
$$;

create trigger kb_entries_clear_stale_embedding
  before update of title, content on public.kb_entries
  for each row
  when (old.title is distinct from new.title or old.content is distinct from new.content)
  execute function private.clear_kb_entry_embedding();
