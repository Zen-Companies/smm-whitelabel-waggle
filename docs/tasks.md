# Tasks: Pass 1

Work top to bottom, one task at a time. Each task ends with its "Done when" passing and tests green. Check the box when done.

## Phase 0: Foundations

- [x] **T0. Project setup**
      Next.js (App Router, TS strict), Tailwind, shadcn/ui, Vitest, ESLint/Prettier, Sentry, folder structure from `docs/tdd.md` §3, `.env.example` from §17, Supabase local.
      _Done when:_ `pnpm dev`, `pnpm test`, `pnpm lint` all pass on an empty app.

- [x] **T1. Schema, RLS and seed**
      Migrations for every table in TDD §5, indexes, RLS policies (§13), pgvector, default autonomy settings function.
      _Done when:_ migrations apply cleanly; an RLS test proves user A can't read tenant B's rows.

- [x] **T2. Interfaces and adapters skeleton**
      `SocialProvider` + Zernio adapter, `Classifier` + Jev adapter + LLM adapter + `FallbackClassifier`, LLM client with `ai_usage` recording, audit helper.
      _Done when:_ adapters compile, unit tests with mocked HTTP pass, `FallbackClassifier` falls back on timeout.

## Phase 1: Tenants and accounts

- [x] **T3. Signup and tenant creation**
      Supabase Auth signup → tenant + member → Zernio profile (handle 409 conflict).
      _Done when:_ signup creates exactly one tenant and one linked Zernio profile, even on retry.

- [x] **T4. Connect accounts**
      Settings page with Connect Instagram / Facebook buttons → Zernio connect URL → redirect back.
      _Done when:_ a test Instagram account connects and appears after `account.connected`.
      _Status:_ verified live on 2026-10-28: a test Instagram account (`beachater_test_page`) connected through Zernio and appeared after a real `account.connected` delivery (local app via ngrok). Also covered by the handler and webhook fixture tests.

## Phase 2: Inbox pipeline

- [x] **T5. Webhook receiver**
      `/api/webhooks/zernio`: raw body, HMAC verify, dedupe into `webhook_events`, event mapping (TDD §7.1), return 200 fast. Fixtures in `tests/fixtures/zernio/`.
      _Done when:_ replaying the same fixture twice creates one item; a bad signature returns 400.

- [x] **T6. Status machine and job runner**
      `features/inbox/status.ts` (`nextStatus`), `/api/jobs/process` with claim query (§7.2), retries (§14), pg_cron + pg_net migration calling it with `CRON_SECRET`.
      _Done when:_ seeded `new` items move through mocked steps; a failing step is tried 3 times in total, then fails and escalates.
      _Note:_ the job route tracks its own deadline and stops claiming items before Vercel's max function duration.

- [x] **T7. Triage**
      Classification step using `FallbackClassifier`; stores category, confidence, classifier_used. Local Jev test script against message fixtures with an accuracy report.
      _Done when:_ every item gets a category; forced Jev failure uses LLM; local Jev report runs.
      _Note:_ also evaluate Jev through OpenRouter's Decisions API (`typesafe/jev-1.13`, alpha) alongside the current endpoint.

- [x] **T8. Knowledge base**
      CRUD UI, embeddings on save, retrieval function (top 5 by similarity, tenant-scoped). Choose the embedding model, then a migration sets `kb_entries.embedding` to `vector(N)` and adds the HNSW index (deferred from T1). Re-embedding picks up entries where `embedding is null` (a T1 trigger clears it whenever title or content changes).
      _Done when:_ retrieval returns the right entry for sample questions.

- [x] **T9. Drafting**
      `generateObject` with `DraftResult` schema, prompt rules (TDD §10), lead extraction, `ai_usage` rows.
      _Done when:_ covered questions get correct drafts; uncovered ones set `needsHuman`.

- [x] **T10. Policy check and autonomy settings**
      Pure `policy()` (TDD §11) with full unit tests; settings UI per category.
      _Done when:_ all policy branches are tested; changing a mode changes the next item's outcome.

- [x] **T11. Approval inbox**
      Inbox page: original message, draft, category; approve / edit / reject; Realtime updates.
      _Done when:_ a new draft appears live; approve, edit and reject each work.

- [x] **T12. Sending**
      Comment reply and DM send via `SocialProvider`; idempotency key; 24-hour check; 500 reconcile; 429 handling.
      _Done when:_ an approved reply posts exactly once on the test account; an expired DM window escalates.
      _Note:_ verified against the mock provider (integration tests); the live post on the test account is the next live session.

- [x] **T13. Escalation, alerts and leads**
      Resend emails (escalation, lead, disconnect, waiting-draft nudge); leads list page.
      _Done when:_ each alert type sends one email; leads appear with a link to the conversation.
      _Note:_ without `RESEND_API_KEY` alerts are logged (status `logged`); verified with a fake mailer in the integration tests.

## Phase 3: Publishing and billing

- [ ] **T14. Publishing**
      Compose page (text + image, target accounts, now or scheduled), `createPost` with idempotency key, status from `post.*` webhooks, retry on failure. VERIFY Zernio scheduling and media fields first.
      _Done when:_ a post publishes now and on schedule, and status shows correctly.
      _Note:_ show a friendly message for Zernio's 409 duplicate-content error (same content to the same account within 24 h).
      _Note:_ surface `post.failed` caused by a Zernio pause (402 `PAYMENT_REQUIRED`, docs.zernio.com/multi-tenant): Zernio doesn't retry posts that came due while the team was paused, so show them as "failed: needs rescheduling" with a reschedule action. Also subscribe to `post.cancelled` (a post targeting only an account deleted after its 1-hour disconnect grace period is cancelled).
      _Note:_ `POST /v1/posts` accepts any account id the Zernio team owns; only ever send the tenant's own accounts (map `posts.target_account_ids` to that tenant's `zernio_account_id`s).

- [ ] **T15. Billing**
      Stripe Checkout, `/api/webhooks/stripe`, subscription status sync, processing gate + billing banner.
      _Done when:_ active subscription processes items; cancelled pauses them.

## Phase 4: Pilot hardening

- [ ] **T16. Health and backfill** (required before launch)
      Hourly account health check (`GET /v1/accounts/health?profileId=…`, `needsReconnect`, `issues`), reconnect emails, inbox backfill sweep after connect and after a Zernio pause ends (inbox polling stops while the team is paused).
      _Done when:_ a disconnected account is detected without a webhook and the owner is emailed.

- [ ] **T17. Audit and cost view**
      Audit trail on each item; simple admin page with AI cost per tenant and per message, plus Zernio cost per tenant from `GET /v1/usage?range=cycle&groupBy=profile` (`attribution.groups[]` by profile id; credits and other team-level fees are `unattributed`).
      _Done when:_ any sent reply can be traced to its draft, decision and AI calls.

- [ ] **T18. Staging smoke test**
      Staging webhook scoped to a test profile; run the full loop end to end.
      _Done when:_ post → comment → classify → draft → approve → reply works on staging.

- [ ] **T6b. Per-tenant fairness in the job claim** (T6 follow-up)
      Cap items per tenant per tick in `claim_items` (at most N of the batch of 20 per tenant, oldest first within a tenant), so one tenant's burst can't starve the others. Zernio's rate limit is one team-wide budget shared by every tenant (docs.zernio.com/multi-tenant: queue bursts per customer).
      _Done when:_ a tenant with 100 due items and one with 1 both get processed in the same tick.

- [ ] **T19. Zernio 402 PAYMENT_REQUIRED is platform-wide**
      A 402 with `code: "PAYMENT_REQUIRED"` means the whole Zernio team is paused (every profile, reads included). Treat it as a platform state, not an item failure: pause sending for all tenants (no attempts counted), alert the operator once (not the owners), don't escalate per item to customers, and resume automatically when a probe call succeeds. Then run the T16 backfill.
      _Done when:_ a mocked 402 on send pauses all sending, sends one operator alert, escalates nothing, and sending resumes after the mock clears.

- [ ] **T20. 429: accept Retry-After and X-RateLimit-Reset**
      The adapter reads only `X-RateLimit-Reset` (through the SDK's `RateLimitError`); Zernio's multi-tenant page says to wait for `Retry-After`. Use whichever is present (`Retry-After` seconds or HTTP date first, then `X-RateLimit-Reset`), with a fallback, for every Zernio call.
      _Done when:_ adapter tests cover both headers and neither.

## Later

- [ ] **T21. Customer offboarding**
      When a tenant leaves: disconnect each of its accounts (`DELETE /v1/accounts/{accountId}`; active accounts block profile deletion with 400), then delete the Zernio profile, then delete or anonymize the tenant's data per the retention policy. Audit each step.
      _Done when:_ offboarding a test tenant leaves no connected accounts or profile on Zernio and no tenant rows here.
