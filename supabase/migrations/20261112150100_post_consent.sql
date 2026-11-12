-- TikTok asks the owner to confirm every post ("I've checked this post and agree to publish it").
-- Kept on the post, so a scheduled or retried post still carries it when it goes to Zernio.
alter table public.posts add column tiktok_consent_at timestamptz;
