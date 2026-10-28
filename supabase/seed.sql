-- Local development seed (supabase db reset). Never run against production.
-- Owner login: owner@example.com / password123

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'owner@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', 'email',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"owner@example.com","email_verified":true}',
  now(), now(), now()
);

-- The tenants trigger adds the default autonomy settings.
insert into public.tenants (id, name)
values ('10000000-0000-4000-8000-000000000001', 'Demo Coffee Shop');

insert into public.tenant_members (tenant_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'owner');

insert into public.kb_entries (tenant_id, title, content) values
  ('10000000-0000-4000-8000-000000000001', 'Opening hours', 'Mon-Fri 7am-6pm, Sat-Sun 8am-4pm.'),
  ('10000000-0000-4000-8000-000000000001', 'Location', '12 Harbour Street, next to the ferry terminal.'),
  ('10000000-0000-4000-8000-000000000001', 'Catering', 'We cater events of 10-60 people. Ask for a quote by DM.');

-- Local job runner: pg_cron → pg_net → the dev server (docs/tdd.md §7.2). Must match CRON_SECRET
-- in .env.local. Other environments set their own Vault secrets.
select vault.create_secret('http://host.docker.internal:3000/api/jobs/process', 'job_process_url');
select vault.create_secret('local-dev-cron-secret', 'cron_secret');
