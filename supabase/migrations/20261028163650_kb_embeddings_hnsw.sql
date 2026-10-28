-- Knowledge base embeddings (docs/tasks.md T8). Model: openai/text-embedding-3-small through
-- OpenRouter, 1536 dimensions. A different model needs a migration that changes the dimension
-- and re-embeds (set embedding = null; the job route re-embeds null entries).

-- Any embedding stored before the model was fixed can't be trusted: start clean.
update public.kb_entries set embedding = null where embedding is not null;

alter table public.kb_entries
  alter column embedding type extensions.vector(1536);

create index kb_entries_embedding_hnsw_idx on public.kb_entries
  using hnsw (embedding extensions.vector_cosine_ops);

-- Top matches by cosine similarity, one tenant only (docs/tdd.md §10). Service role only: the
-- caller passes the tenant it has already verified.
create function public.match_kb_entries(
  p_tenant_id uuid,
  p_query_embedding extensions.vector(1536),
  p_limit int default 5
)
returns table (id uuid, title text, content text, similarity double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.content,
         1 - (e.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.kb_entries e
  where e.tenant_id = p_tenant_id and e.embedding is not null
  order by e.embedding operator(extensions.<=>) p_query_embedding
  limit least(greatest(p_limit, 1), 20);
$$;

revoke all on function public.match_kb_entries(uuid, extensions.vector, int)
  from public, anon, authenticated;
grant execute on function public.match_kb_entries(uuid, extensions.vector, int) to service_role;
