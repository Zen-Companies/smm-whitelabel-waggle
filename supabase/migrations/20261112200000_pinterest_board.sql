-- T64: the Pinterest board a brand's pins go to, chosen in the composer and remembered per
-- account. Without one Zernio pins to the account's first board.
alter table public.social_accounts
  add column pinterest_board_id text,
  add column pinterest_board_name text;
