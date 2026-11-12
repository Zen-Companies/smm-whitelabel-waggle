-- T67: a WhatsApp template reply (name, language, values), the only message WhatsApp allows 24
-- hours after the customer's last one. The draft's body holds the rendered text for the inbox.
alter table public.drafts add column template jsonb
  check (template is null or jsonb_typeof(template) = 'object');
