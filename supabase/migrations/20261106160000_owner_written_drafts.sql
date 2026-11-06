-- MCP (docs/mcp/PLAN.md §5.2, Q1): the owner can answer a message Waggle handed to them (a
-- complaint, an unclear message) with their own words, from the inbox or an AI assistant. Such a
-- draft is marked so policy() sends it on the owner's say-so, within the hard limits only.
alter table public.drafts add column owner_written boolean not null default false;
