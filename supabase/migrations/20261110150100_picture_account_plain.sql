-- T57: tenants.picture_account_id stays a plain id. A foreign key to social_accounts made every
-- PostgREST embed between tenants and social_accounts ambiguous (two relationships). The app
-- falls back to the first account with a picture when the chosen one is gone.
alter table public.tenants drop constraint tenants_picture_account_id_fkey;
