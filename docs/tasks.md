# Tasks: Pass 1

Work top to bottom, one task at a time. Each task ends with its "Done when" passing and tests green. Check the box when done.

## Phase 0: Foundations

- [x] **T0. Project setup**
      Next.js (App Router, TS strict), Tailwind, shadcn/ui, Vitest, ESLint/Prettier, Sentry, folder structure from `docs/tdd.md` §3, `.env.example` from §17, Supabase local.
      _Done when:_ `pnpm dev`, `pnpm test`, `pnpm lint` all pass on an empty app.

- [x] **T1. Schema, RLS and seed**
      Migrations for every table in TDD §5, indexes, RLS policies (§13), pgvector, default autonomy settings function.
      _Done when:_ migrations apply cleanly; an RLS test proves user A can't read tenant B's rows.

- [ ] **T2. Interfaces and adapters skeleton**
      `SocialProvider` + Zernio adapter, `Classifier` + Jev adapter + LLM adapter + `FallbackClassifier`, LLM client with `ai_usage` recording, audit helper.
      _Done when:_ adapters compile, unit tests with mocked HTTP pass, `FallbackClassifier` falls back on timeout.

## Phase 1: Tenants and accounts

- [ ] **T3. Signup and tenant creation**
      Supabase Auth signup → tenant + member → Zernio profile (handle 409 conflict).
      _Done when:_ signup creates exactly one tenant and one linked Zernio profile, even on retry.

- [ ] **T4. Connect accounts**
      Settings page with Connect Instagram / Facebook buttons → Zernio connect URL → redirect back.
      _Done when:_ a test Instagram account connects and appears after `account.connected`.

## Phase 2: Inbox pipeline

- [ ] **T5. Webhook receiver**
      `/api/webhooks/zernio`: raw body, HMAC verify, dedupe into `webhook_events`, event mapping (TDD §7.1), return 200 fast. Fixtures in `tests/fixtures/zernio/`.
      _Done when:_ replaying the same fixture twice creates one item; a bad signature returns 400.

- [ ] **T6. Status machine and job runner**
      `features/inbox/status.ts` (`nextStatus`), `/api/jobs/process` with claim query (§7.2), retries (§14), pg_cron + pg_net migration calling it with `CRON_SECRET`.
      _Done when:_ seeded `new` items move through mocked steps; a failing step retries 3 times then fails and escalates.

- [ ] **T7. Triage**
      Classification step using `FallbackClassifier`; stores category, confidence, classifier_used. Local Jev test script against message fixtures with an accuracy report.
      _Done when:_ every item gets a category; forced Jev failure uses LLM; local Jev report runs.

- [ ] **T8. Knowledge base**
      CRUD UI, embeddings on save, retrieval function (top 5 by similarity, tenant-scoped). Choose the embedding model, then a migration sets `kb_entries.embedding` to `vector(N)` and adds the HNSW index (deferred from T1). Re-embedding picks up entries where `embedding is null` (a T1 trigger clears it whenever title or content changes).
      _Done when:_ retrieval returns the right entry for sample questions.

- [ ] **T9. Drafting**
      `generateObject` with `DraftResult` schema, prompt rules (TDD §10), lead extraction, `ai_usage` rows.
      _Done when:_ covered questions get correct drafts; uncovered ones set `needsHuman`.

- [ ] **T10. Policy check and autonomy settings**
      Pure `policy()` (TDD §11) with full unit tests; settings UI per category.
      _Done when:_ all policy branches are tested; changing a mode changes the next item's outcome.

- [ ] **T11. Approval inbox**
      Inbox page: original message, draft, category; approve / edit / reject; Realtime updates.
      _Done when:_ a new draft appears live; approve, edit and reject each work.

- [ ] **T12. Sending**
      Comment reply and DM send via `SocialProvider`; idempotency key; 24-hour check; 500 reconcile; 429 handling.
      _Done when:_ an approved reply posts exactly once on the test account; an expired DM window escalates.

- [ ] **T13. Escalation, alerts and leads**
      Resend emails (escalation, lead, disconnect, waiting-draft nudge); leads list page.
      _Done when:_ each alert type sends one email; leads appear with a link to the conversation.

## Phase 3: Publishing and billing

- [ ] **T14. Publishing**
      Compose page (text + image, target accounts, now or scheduled), `createPost` with idempotency key, status from `post.*` webhooks, retry on failure. VERIFY Zernio scheduling and media fields first.
      _Done when:_ a post publishes now and on schedule, and status shows correctly.

- [ ] **T15. Billing**
      Stripe Checkout, `/api/webhooks/stripe`, subscription status sync, processing gate + billing banner.
      _Done when:_ active subscription processes items; cancelled pauses them.

## Phase 4: Pilot hardening

- [ ] **T16. Health and backfill**
      Hourly account health check, reconnect emails, inbox backfill sweep after connect.
      _Done when:_ a disconnected account is detected without a webhook and the owner is emailed.

- [ ] **T17. Audit and cost view**
      Audit trail on each item; simple admin page with AI cost per tenant and per message.
      _Done when:_ any sent reply can be traced to its draft, decision and AI calls.

- [ ] **T18. Staging smoke test**
      Staging webhook scoped to a test profile; run the full loop end to end.
      _Done when:_ post → comment → classify → draft → approve → reply works on staging.
