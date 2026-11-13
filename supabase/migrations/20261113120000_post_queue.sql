-- T75: a post placed in the brand's next free posting time (Zernio's queue picks and holds
-- the time; scheduled_for is filled in from Zernio's answer).
alter table public.posts add column queued boolean not null default false;
