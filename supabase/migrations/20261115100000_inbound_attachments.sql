-- T72: what a message carried besides text (photo, video, sticker, voice, share), so the inbox can
-- say "Sent a photo" instead of "(no text)" and show a preview. Only the type is stored: media
-- links expire, so the preview is fetched fresh through Zernio by message id and position
-- (docs.zernio.com/webhooks/inbox/message-received).
alter table public.inbound_items
  add column attachments jsonb not null default '[]'::jsonb,
  add column platform_message_id text;

alter table public.inbound_items
  add constraint inbound_items_attachments_is_array check (jsonb_typeof(attachments) = 'array');
