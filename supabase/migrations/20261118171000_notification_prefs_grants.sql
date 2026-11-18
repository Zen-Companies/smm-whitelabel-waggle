-- Settings → Notifications saves the person's own choice with their own client (RLS limits it to
-- their row). Tables in public start with no grants (20251029… revoke), so grant what it needs.
grant select on public.notification_prefs to authenticated;
grant insert (user_id, email_frequency, updated_at),
  update (user_id, email_frequency, updated_at)
  on public.notification_prefs to authenticated;
