-- T41 (docs/tdd.md §7.4): where a comment's reply goes. 'public' = under the comment, 'dm' = in
-- the commenter's DMs (Zernio private reply: one per comment, within 7 days). DMs are always
-- 'public' (answered in their own thread). Written by the service role (draft step, approval).
alter table public.drafts add column reply_via text not null default 'public'
  check (reply_via in ('public', 'dm'));
