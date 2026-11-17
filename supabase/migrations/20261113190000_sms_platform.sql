-- T82c: texts on the brand's number. The texting account (Zernio platform 'sms') and its
-- conversations join the platform lists; texts are answered like any chat.

alter table public.social_accounts drop constraint social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check check (
  platform in (
    'instagram', 'facebook', 'googlebusiness', 'tiktok', 'threads', 'youtube', 'linkedin',
    'bluesky', 'twitter', 'whatsapp', 'telegram', 'pinterest', 'discord', 'reddit', 'snapchat',
    'line', 'imap', 'google', 'microsoft', 'phone', 'sms'
  )
);

alter table public.conversations drop constraint conversations_platform_check;
alter table public.conversations add constraint conversations_platform_check check (
  platform in (
    'instagram', 'facebook', 'googlebusiness', 'tiktok', 'threads', 'youtube', 'linkedin',
    'bluesky', 'twitter', 'whatsapp', 'telegram', 'pinterest', 'discord', 'reddit', 'snapchat',
    'line', 'imap', 'google', 'microsoft', 'phone', 'sms'
  )
);
