# Task: Waggle remote MCP server (Claude, ChatGPT, Grok)

Decisions made on 2026-11-06 are marked **[decided]**.

## Goal
Let owners use Waggle from their own AI assistant: Claude (custom connector), ChatGPT (Developer Mode,
then the Apps SDK directory) and Grok (custom connector). All three are in scope for the first
release **[decided]**.

The MCP server runs only deterministic operations. The user's AI does the reasoning for anything
the owner does in chat. Waggle's background loop doesn't change: Jev triage and knowledge-base
drafting for incoming comments and DMs keep running server-side. This is not a project to cut AI
costs to zero.

HARD RULE: MCP tool handlers never call an LLM or Jev. Where a feature uses one internally (drafting,
classifying), the tool returns the raw data plus the knowledge-base facts, and its description tells
the calling model to do the reasoning. List every place this forces a design change.

## Waggle rules that apply (CLAUDE.md)
- Zernio only through `SocialProvider`; respect its rate limits, since MCP adds callers.
- Every reply sent passes `policy()`; every send uses an idempotency key.
- Only `features/inbox/status.ts` changes `inbound_items.status`.
- Every state change and owner action writes to `audit_log`.
- Never log customer message text (Sentry, console, MCP audit): ids only.
- Every new tenant table has `tenant_id` and RLS; the service-role client stays server-only.
- Tests use mocks (`SOCIAL_PROVIDER_MODE=mock`); no real Zernio or paid AI calls.
- UI follows docs/design.md; design-first: new screens go on the "Waggle screens v3" canvas for
  approval before they are built.
- Features import each other only through `index.ts`; MCP code reuses feature APIs, never internals.

## Brands **[decided]**
A login can own several brands (tenants). At connect, the consent screen lists the user's brands with
checkboxes; the grant (and its tokens) covers only the ticked brands. A `list_brands` tool returns
the granted brands. Every brand-scoped tool takes `brand_id`, which the server checks against the
grant AND current ownership on each call. A grant with one brand may default to it. Never trust a
user id or tenant id from arguments beyond that check. Users can change a grant's brands or revoke it
in settings.

## Scope: full actions **[decided]**
Read (inbox, posts, analytics, knowledge base) and act: create/edit drafts, approve/send replies,
schedule/publish posts.

Prompt-injection guard **[decided]**: tool results include customer text (untrusted). Mark it as
untrusted in the output (separate field, e.g. `customer_text`), and say so in tool descriptions. Send
and publish tools:
- go through `policy()` and the same status transitions as the app, never a shortcut path;
- use the existing 8-second undo window;
- have a per-brand daily cap on AI-initiated sends/publishes (configurable);
- are annotated `destructiveHint: true` with descriptions that ask the host to confirm with the user;
- are attributed in `audit_log` to the user and the AI client.

## Access **[decided]**
Behind a feature flag: off globally and per brand by default; we turn it on per brand. Billing tier
is undecided. Don't tie it to Stripe yet.

## Admin role **[decided]**
Waggle has no staff/admin concept today. Add one: a staff table plus a permission matrix (roles →
permissions, e.g. `mcp_docs.view`, `mcp_playground.run`, `mcp_audit.view`, `mcp_flags.manage`),
checked server-side. Propose the schema in PLAN.md.

## Phase 0: Discovery (write no code)
1. Confirm the stack details that matter here: Next.js 16 routes and route handlers, Supabase Auth,
   RLS and tenant scoping, the brand cookie and `getCurrentTenant`, Vercel deployment, the test setup.
2. Propose 5–15 task-shaped tools. For each: name, purpose, input schema, output shape, read-only or
   mutating, annotations, required scope, the feature `index.ts` API it wraps, and any LLM it must
   avoid.
3. Auth: check whether Supabase Auth's OAuth 2.1 server can be the authorization server, including
   Dynamic Client Registration, PKCE S256, refresh tokens, audience-bound tokens, and a custom consent
   screen (with the brand picker). Use the current Supabase docs, not memory. If it falls short,
   compare a minimal auth server in the app with a managed provider.
4. Look up the current official callback URLs and connector requirements for Claude, ChatGPT and
   Grok from their docs and cite the sources.
5. Propose the admin schema, the feature flag schema, the MCP audit table, and rate limits (per user,
   per client, per brand).
6. Note the screens that need designs first: consent and brand picker, connected AI assistants in settings,
   and the admin pages.
7. Write it up in docs/mcp/PLAN.md and STOP for approval.

## Phase 1: MCP server
- Official MCP TypeScript SDK, Streamable HTTP, at `/api/mcp`. Check whether Vercel's `mcp-handler`
  fits Next.js 16.
- One Zod registry module (e.g. `src/features/mcp/tools/registry.ts`) is the single source of truth
  for the server, validation and the admin docs.
- Accurate annotations; descriptions written for the model; concise, paginated, size-capped results.

## Phase 2: Auth (OAuth 2.1, MCP authorization spec)
- RFC 9728 protected resource metadata, RFC 8414 authorization server metadata, RFC 7591 DCR.
- Authorization code + PKCE (S256 only), refresh tokens, short-lived audience-bound access tokens.
- 401 with a `WWW-Authenticate` header pointing at the resource metadata.
- Redirect URI allowlist in env config, from the sources found in Phase 0.
- Consent screen: client name, scopes, brand checkboxes.
- Token → user → granted brands on every call; reuse RLS.
- Settings: see, edit and revoke connected AI assistants.

## Phase 3: Safety and ops
- Rate limits per user, client and brand on `/api/mcp`.
- MCP audit table: time, user, brand, client, tool, success/error, latency; arguments redacted, no
  customer text. Admin playground calls are flagged.
- Structured errors with no stack traces or internals.
- The feature flag (global + per brand).
- New env vars in `.env.example` with comments; no secrets in code.

## Phase 4: Admin docs (staff only) **[decided: in scope]**
- OpenAPI 3.1 generated from the registry (each tool: input, output, annotations, scopes,
  example), plus the OAuth and `.well-known` endpoints.
- Swagger UI at `/admin/mcp-docs`, raw spec at `/admin/mcp-docs/openapi.json`.
- Protected server-side by the permission matrix; non-staff get 404; noindex; not in any sitemap.
- "Try it" playground: runs a tool as a chosen test user and brand through the same handler path,
  logged and flagged as admin.
- Audit view with filters by tool, brand and errors.
- The spec regenerates from the registry; a test fails if a tool is missing from the spec.

## Phase 5: Testing and docs
- Unit tests per handler: success, validation failure, brand isolation (A can't reach B, and a
  grant can't reach an unticked brand of the same user), permission denial, the daily send cap.
- Integration test: register → authorize with PKCE → token → tool call → refresh → revoke.
- MCP Inspector against a dev tunnel.
- docs/mcp/README.md: architecture, env vars, adding a tool, connection guides for Claude, ChatGPT
  and Grok.
- docs/mcp/SUBMISSION.md: checklists for the ChatGPT app directory and Anthropic's connector
  directory, from the current official docs.

## Working rules
- Follow the existing conventions; one reviewable commit per phase; ask before pushing or deploying.
- Stop and ask on any security, tenancy or billing decision not covered above.
- End with a summary: what was built, what's left, risks.
