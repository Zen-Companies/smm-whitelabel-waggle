-- AI assistants: change a post in two steps, like posting (MCP catch-up, 27 Nov). A preview of an
-- edit, a move or a text fix of an existing post is stored in post_previews with the post it
-- changes (post_id) and what kind of change it is; apply_post_change commits it once, after the
-- owner said yes. A row without `change` stays a new post (create_post), as before. Additive only.

alter table public.post_previews
  add column change text check (change in ('edit', 'move', 'fix_text'));

alter table public.post_previews
  add constraint change_names_its_post check (change is null or post_id is not null);
