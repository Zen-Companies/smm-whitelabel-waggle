-- Conversations, inbound items and drafts (docs/tdd.md §5, §6).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  social_account_id uuid not null,
  zernio_conversation_id text not null unique,
  platform text not null check (platform in ('instagram', 'facebook')),
  participant_name text,
  participant_external_id text,
  last_customer_message_at timestamptz,
  unique (id, tenant_id),
  foreign key (social_account_id, tenant_id)
    references public.social_accounts (id, tenant_id) on delete cascade
);
create index conversations_tenant_id_idx on public.conversations (tenant_id);
create index conversations_social_account_id_idx on public.conversations (social_account_id);

create table public.inbound_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  social_account_id uuid not null,
  kind text not null check (kind in ('comment', 'dm')),
  zernio_message_id text unique,
  zernio_comment_id text unique,
  zernio_post_id text,
  conversation_id uuid,
  author_name text,
  text text not null,
  received_at timestamptz not null,
  -- Written only by features/inbox/status.ts (CLAUDE.md rule 5).
  status text not null default 'new' check (status in (
    'new', 'classified', 'drafted', 'awaiting_approval', 'sending', 'sent',
    'rejected', 'ignored', 'escalated', 'paused', 'failed'
  )),
  category text check (category in ('faq', 'lead', 'complaint', 'spam', 'unclear')),
  confidence numeric(5, 4) check (confidence between 0 and 1),
  classifier_used text check (classifier_used in ('jev', 'llm')),
  -- Per-category scores from the classifier, for threshold tuning (§9.3). Never message text.
  classifier_scores jsonb,
  attempts int not null default 0 check (attempts >= 0),
  next_run_at timestamptz,
  locked_at timestamptz,
  last_error text,
  unique (id, tenant_id),
  foreign key (social_account_id, tenant_id)
    references public.social_accounts (id, tenant_id) on delete cascade,
  foreign key (conversation_id, tenant_id)
    references public.conversations (id, tenant_id) on delete cascade,
  check (
    (kind = 'comment' and zernio_comment_id is not null)
    or (kind = 'dm' and zernio_message_id is not null and conversation_id is not null)
  )
);
create index inbound_items_status_next_run_at_idx on public.inbound_items (status, next_run_at);
create index inbound_items_tenant_id_created_at_idx on public.inbound_items (tenant_id, created_at desc);
create index inbound_items_social_account_id_idx on public.inbound_items (social_account_id);
create index inbound_items_conversation_id_idx on public.inbound_items (conversation_id);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null,
  body text not null,
  edited_body text,
  model text,
  kb_entry_ids uuid[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'sent', 'failed')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  sent_at timestamptz,
  zernio_reply_id text,
  idempotency_key text not null unique default gen_random_uuid()::text,
  foreign key (item_id, tenant_id)
    references public.inbound_items (id, tenant_id) on delete cascade
);
create index drafts_tenant_id_status_idx on public.drafts (tenant_id, status);
create index drafts_item_id_idx on public.drafts (item_id);
