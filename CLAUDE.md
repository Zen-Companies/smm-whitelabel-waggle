# CLAUDE.md

## Project

AI Receptionist MVP: a multi-tenant app where local businesses publish posts and an AI receptionist handles Instagram/Facebook comments and DMs. Zernio is the social layer, Jev (TypeSafe AI) sorts messages, an LLM drafts replies from the business's knowledge base, and the owner approves.

Read before working:

- `docs/prd.md`: what we're building and acceptance criteria.
- `docs/tdd.md`: how it's built (data model, status machine, flows, interfaces).
- `docs/tasks.md`: the ordered task list. Work on one task at a time.

## Stack

Next.js (App Router) + TypeScript strict · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Realtime, pgvector, pg_cron, pg_net) · Vercel · Zernio (`@zernio/node`) · Jev · Vercel AI SDK (direct provider) · Resend · Sentry · Stripe · zod · Vitest.

Next.js 16 has breaking changes from older versions: check `node_modules/next/dist/docs/` before using a Next.js API.

## Commands

```bash
pnpm dev              # run the app
pnpm test             # Vitest
pnpm lint             # ESLint
pnpm typecheck        # next typegen && tsc --noEmit
pnpm test:db          # pgTAP tests in supabase/tests (RLS); needs supabase start
pnpm test:integration # Vitest against local Supabase (tests/integration); needs supabase start
pnpm gen:types        # regenerate src/lib/supabase/database.types.ts after a migration
pnpm triage:report    # labeled set → every configured classifier (accuracy, confusion, latency)
pnpm draft:preview    # sample messages → drafts from the demo KB (needs OpenRouter keys)
supabase start        # local Supabase (ports 553xx, see supabase/config.toml)
supabase migration up --local   # apply new migrations, keeps data
supabase db reset     # DESTRUCTIVE: wipes local data (rule 13: ask first)
supabase migration new <name>
```

## Structure

```
src/app/          routes only; thin; call into features
src/features/*    product logic; public API via index.ts
src/lib/*         shared infra: social, classifier, llm, supabase, jobs, audit
src/components/ui shadcn components
supabase/migrations
tests/fixtures    recorded webhook payloads
```

- Features never import another feature's internals, only its `index.ts`.
- Code moves to `lib/` only when a second feature needs it.

## Hard rules

1. **Never call Zernio directly.** Always go through `SocialProvider` (`src/lib/social`).
2. **Never call Jev or an LLM directly from features.** Use `Classifier` and `src/lib/llm`, which record `ai_usage`.
3. **Webhook routes only verify, dedupe and store.** No AI calls, no sending, respond in under 5 seconds.
4. **Every webhook is verified and deduped** by event id in `webhook_events` before anything else.
5. **Only `features/inbox/status.ts` changes `inbound_items.status`.**
6. **No reply is sent without passing `policy()`** (`features/approvals/policy.ts`).
7. **Every send uses an idempotency key**; never retry a Zernio 500 send without reconciling first.
8. **Drafts use only knowledge base facts.** Never let prompts invent prices, availability or promises.
9. **Every tenant table has `tenant_id` and RLS.** The service-role client is server-only.
10. **Never log customer message text** to Sentry or console in production; log ids.
11. **Every state change and owner action writes to `audit_log`.**
12. **Never add a `Co-Authored-By: Claude` (or any Claude attribution) line to commits.**
13. **Never run `supabase db reset` or any destructive DB command without asking first.** Apply migrations with `supabase migration up --local`.
14. **Never make real calls to Zernio or paid AI APIs (OpenRouter, Jev) in tests or smoke tests unless explicitly asked.** Tests use mocks. For local smoke tests set `SOCIAL_PROVIDER_MODE=mock` (the default under Vitest) so signup and connect don't reach Zernio.

## Conventions

- TypeScript strict, no `any`; validate all external input (webhooks, forms, AI output) with zod.
- Server Actions for dashboard mutations; Route Handlers for webhooks and jobs.
- Database changes only through migrations; never edit applied migrations.
- Small, pure functions for logic (status, policy, mapping) with unit tests next to them.
- Names: files kebab-case, components PascalCase, DB snake_case.

## Workflow

1. Pick the next unchecked task in `docs/tasks.md`.
2. Read the relevant PRD and TDD sections.
3. Write or update tests first for pure logic, then implement.
4. Run `pnpm typecheck && pnpm lint && pnpm test`.
5. Check the task box and note anything that changed the design in `docs/tdd.md`.
6. If the spec is unclear or a VERIFY item blocks you, stop and ask; don't guess external API shapes.
