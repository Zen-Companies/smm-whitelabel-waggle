-- Follow-ups for leads that go quiet (Pricing Bible, 18 Nov; design "Billing round 2" §4). The
-- owner writes the follow-up once; when a lead stops answering, Waggle adds them to a Zernio
-- sequence that sends it and stops if they reply. No AI.

-- The Zernio CRM contact behind a conversation (message.received's message.sender.contactId,
-- docs.zernio.com/webhooks/inbox/message-received): what a sequence enrolls.
alter table public.conversations add column zernio_contact_id text;

-- When Waggle sent this lead its follow-up (once per lead).
alter table public.leads add column followed_up_at timestamptz;

-- One per brand: the owner's follow-up and the sequences made from it.
create table public.followup_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  enabled boolean not null default false,
  -- Hours without an answer before it goes out: 1 to 23, inside Meta's 24-hour window.
  wait_minutes integer not null default 1200 check (wait_minutes between 60 and 1380),
  message text not null check (char_length(message) between 1 and 1000),
  -- WhatsApp after 24 hours needs an approved template: { name, language, variables }.
  whatsapp_template jsonb,
  -- Zernio sequence per account: { "<zernio account id>": "<sequence id>" }.
  sequences jsonb not null default '{}'::jsonb check (jsonb_typeof(sequences) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.followup_settings enable row level security;

create policy "no oauth clients" on public.followup_settings as restrictive for all to authenticated, anon
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- A purged brand's follow-up settings go with it, like its previews and uploads.
create or replace function private.forget_purged_previews()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_previews where tenant_id = new.id;
  delete from public.media_uploads where tenant_id = new.id;
  delete from public.followup_settings where tenant_id = new.id;
  return new;
end;
$$;
