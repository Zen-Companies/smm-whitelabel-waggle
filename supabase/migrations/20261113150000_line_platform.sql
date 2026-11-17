-- T81a: LINE chats in the inbox. LINE accounts and their conversations join the platform lists
-- (ids match PLATFORM_IDS in src/lib/social/platforms.ts).

alter table public.social_accounts drop constraint social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check check (
  platform in (
    'instagram', 'facebook', 'googlebusiness', 'tiktok', 'threads', 'youtube', 'linkedin',
    'bluesky', 'twitter', 'whatsapp', 'telegram', 'pinterest', 'discord', 'reddit', 'snapchat',
    'line'
  )
);

alter table public.conversations drop constraint conversations_platform_check;
alter table public.conversations add constraint conversations_platform_check check (
  platform in (
    'instagram', 'facebook', 'googlebusiness', 'tiktok', 'threads', 'youtube', 'linkedin',
    'bluesky', 'twitter', 'whatsapp', 'telegram', 'pinterest', 'discord', 'reddit', 'snapchat',
    'line'
  )
);
