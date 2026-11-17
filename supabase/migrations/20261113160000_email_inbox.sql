-- T81b: email in the inbox. Mailboxes connected with our own form (Zernio platform `imap`) join
-- the platform lists, and an email thread keeps its subject (one conversation per thread).

alter table public.social_accounts drop constraint social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check check (
  platform in (
    'instagram', 'facebook', 'googlebusiness', 'tiktok', 'threads', 'youtube', 'linkedin',
    'bluesky', 'twitter', 'whatsapp', 'telegram', 'pinterest', 'discord', 'reddit', 'snapchat',
    'line', 'imap'
  )
);

alter table public.conversations drop constraint conversations_platform_check;
alter table public.conversations add constraint conversations_platform_check check (
  platform in (
    'instagram', 'facebook', 'googlebusiness', 'tiktok', 'threads', 'youtube', 'linkedin',
    'bluesky', 'twitter', 'whatsapp', 'telegram', 'pinterest', 'discord', 'reddit', 'snapchat',
    'line', 'imap'
  )
);

-- The email thread's subject (null for chats, and for email when the event doesn't carry one).
alter table public.conversations add column subject text;
