-- T82b: missed calls and voicemails in the inbox. A phone number is an account (platform
-- 'phone'); an inbound call that wasn't answered (no answer, or voicemail) becomes a `call` item
-- that goes straight to the owner (escalated): it's never classified or drafted, the owner calls
-- back and marks it handled. zernio_call_id dedupes redelivered call.ended events.

alter table public.social_accounts drop constraint social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check check (
  platform in (
    'instagram', 'facebook', 'googlebusiness', 'tiktok', 'threads', 'youtube', 'linkedin',
    'bluesky', 'twitter', 'whatsapp', 'telegram', 'pinterest', 'discord', 'reddit', 'snapchat',
    'line', 'imap', 'google', 'microsoft', 'phone'
  )
);

alter table public.conversations drop constraint conversations_platform_check;
alter table public.conversations add constraint conversations_platform_check check (
  platform in (
    'instagram', 'facebook', 'googlebusiness', 'tiktok', 'threads', 'youtube', 'linkedin',
    'bluesky', 'twitter', 'whatsapp', 'telegram', 'pinterest', 'discord', 'reddit', 'snapchat',
    'line', 'imap', 'google', 'microsoft', 'phone'
  )
);

alter table public.inbound_items
  add column zernio_call_id text,
  add column call_voicemail boolean,
  add column call_duration_seconds integer;

alter table public.inbound_items drop constraint inbound_items_kind_check;
alter table public.inbound_items drop constraint inbound_items_kind_ids_check;
alter table public.inbound_items
  add constraint inbound_items_kind_check check (kind in ('comment', 'dm', 'review', 'call')),
  add constraint inbound_items_kind_ids_check check (
    (kind = 'comment' and zernio_comment_id is not null)
    or (kind = 'dm' and zernio_message_id is not null and conversation_id is not null)
    or (kind = 'review' and zernio_review_id is not null)
    or (kind = 'call' and zernio_call_id is not null)
  );

-- Not partial (nulls never collide), so the mapping's upsert can name it as its conflict target.
create unique index inbound_items_zernio_call_id_key on public.inbound_items (zernio_call_id);
