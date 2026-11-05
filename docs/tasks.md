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
      _Status:_ verified live on 2026-10-30 (Test Page, `beachater_test_page`, local app via ngrok, Auto-send on): a DM question ("Are you open on Saturday?") was sorted by jevos (faq, 0.93), drafted from Business info and sent on its own once, 51 s after arrival (owner confirmed it appeared once on Instagram). A scam DM was hidden as spam (LLM fallback) and, when jevos sorted it as a question at 0.65, escalated as low confidence; a link-only comment went to Needs you as unclear. Still to verify live: a comment reply, the owner-approved flow with Undo, a DM older than 24 h, a post with an image. jevos on this laptop needs `JEV_TIMEOUT_MS=15000` locally (3.3 to 9.5 s per call).

- [x] **T13. Escalation, alerts and leads**
      Resend emails (escalation, lead, disconnect, waiting-draft nudge); leads list page.
      _Done when:_ each alert type sends one email; leads appear with a link to the conversation.
      _Note:_ without `RESEND_API_KEY` alerts are logged (status `logged`); verified with a fake mailer in the integration tests.

## Phase 3: Publishing and billing

- [x] **T14. Publishing**
      Compose page (text + image, target accounts, now or scheduled), `createPost` with idempotency key, status from `post.*` webhooks, retry on failure. VERIFY Zernio scheduling and media fields first.
      _Done when:_ a post publishes now and on schedule, and status shows correctly.
      _Note:_ verified with the mock provider (integration tests); the media presign upload and a real post are for the live session.
      _Note:_ show a friendly message for Zernio's 409 duplicate-content error (same content to the same account within 24 h).
      _Note:_ surface `post.failed` caused by a Zernio pause (402 `PAYMENT_REQUIRED`, docs.zernio.com/multi-tenant): Zernio doesn't retry posts that came due while the team was paused, so show them as "failed: needs rescheduling" with a reschedule action. Also subscribe to `post.cancelled` (a post targeting only an account deleted after its 1-hour disconnect grace period is cancelled).
      _Note:_ `POST /v1/posts` accepts any account id the Zernio team owns; only ever send the tenant's own accounts (map `posts.target_account_ids` to that tenant's `zernio_account_id`s).

- [ ] **T15. Billing**
      Stripe Checkout, `/api/webhooks/stripe`, subscription status sync, processing gate + billing banner.
      _Done when:_ active subscription processes items; cancelled pauses them.

## Phase 4: Pilot hardening

- [x] **T16. Health and backfill** (required before launch)
      Hourly account health check (`GET /v1/accounts/health?profileId=…`, `needsReconnect`, `issues`), reconnect emails, inbox backfill sweep after connect and after a Zernio pause ends (inbox polling stops while the team is paused).
      _Done when:_ a disconnected account is detected without a webhook and the owner is emailed.
      _Note:_ comments are backfilled; DMs are not until the list endpoint's message ids are confirmed to match the webhook's (VERIFY on the live session).

- [x] **T17. Audit and cost view**
      Audit trail on each item; simple admin page with AI cost per tenant and per message, plus Zernio cost per tenant from `GET /v1/usage?range=cycle&groupBy=profile` (`attribution.groups[]` by profile id; credits and other team-level fees are `unattributed`).
      _Done when:_ any sent reply can be traced to its draft, decision and AI calls.

- [ ] **T18. Staging smoke test**
      Staging webhook scoped to a test profile; run the full loop end to end.
      _Done when:_ post → comment → classify → draft → approve → reply works on staging.

- [x] **T6b. Per-tenant fairness in the job claim** (T6 follow-up)
      Cap items per tenant per tick in `claim_items` (at most N of the batch of 20 per tenant, oldest first within a tenant), so one tenant's burst can't starve the others. Zernio's rate limit is one team-wide budget shared by every tenant (docs.zernio.com/multi-tenant: queue bursts per customer).
      _Done when:_ a tenant with 100 due items and one with 1 both get processed in the same tick.

- [x] **T19. Zernio 402 PAYMENT_REQUIRED is platform-wide**
      A 402 with `code: "PAYMENT_REQUIRED"` means the whole Zernio team is paused (every profile, reads included). Treat it as a platform state, not an item failure: pause sending for all tenants (no attempts counted), alert the operator once (not the owners), don't escalate per item to customers, and resume automatically when a probe call succeeds. Then run the T16 backfill.
      _Done when:_ a mocked 402 on send pauses all sending, sends one operator alert, escalates nothing, and sending resumes after the mock clears.

- [x] **T20. 429: accept Retry-After and X-RateLimit-Reset**
      The adapter reads only `X-RateLimit-Reset` (through the SDK's `RateLimitError`); Zernio's multi-tenant page says to wait for `Retry-After`. Use whichever is present (`Retry-After` seconds or HTTP date first, then `X-RateLimit-Reset`), with a fallback, for every Zernio call.
      _Done when:_ adapter tests cover both headers and neither.

- [ ] **T22. Pre-pilot classifier check on Jev 1.13**
      Run `pnpm triage:report --only jev-openrouter` (paid, about $0.004 for the labeled set) with the current questions (`JEV_QUESTIONS_VERSION` 2026-10-29.1) and compare with local jevos; decide the production Jev endpoint and thresholds.
      _Done when:_ per-category accuracy on jev-1.13 is recorded in TDD §9.6 and the endpoint is chosen.

## Phase 5: Measure, then earn the owner's trust

Design: `docs/tdd.md` §19. Nothing in this phase may send, touch `inbound_items` or call `SocialProvider` except where a task says so. Real AI calls only from the pages themselves (an operator or owner pressing Run); tests use mocks (rule 14).

- [x] **T23. Dry-run engine**
      `features/lab`: run one message (text, kind) for a tenant through classify → triage → retrieve → draft → grounding → `policy()` without writing `inbound_items`, `drafts`, `leads` or audit rows, and without `SocialProvider`. Takes a variant (classifier, question version, business context, draft prompt version, model) so two setups can run side by side. Keep old prompt versions in code as named variants. `ai_usage` gets a `source` column (`live` default, `lab`, `practice`) so lab and practice calls are recorded but kept apart.
      _Done when:_ unit tests with a mocked classifier and LLM show every step's output for both variants, no writes outside `ai_usage`, and no `SocialProvider` call.
      _Note:_ earlier messages of a thread come with T30 (drafting doesn't use them yet). `cost_by_tenant` now leaves out `lab` calls. Version registries: `JEV_QUESTION_SETS`, `LLM_CLASSIFY_PROMPTS`, `DRAFT_PROMPTS`.

- [x] **T24. Admin Lab: try a message (classification first)**
      `/admin/lab` (operator only, same gate as `/admin/costs`): business picker or blank profile, message + kind, variants A and B, Run. Each side shows category, confidence, per-question scores, triage decision, cost, tokens, time; differences highlighted. "Save as test case" with the right category adds the message to a labeled set (new table, tenant-scoped, RLS). Saved runs listed under History.
      _Done when:_ a run shows both variants side by side, a saved case appears in its set, and non-operators get a 404.
      _Note:_ tables `lab_cases` (also for owner corrections, `origin`) and `lab_runs`; RLS on, no client grants (pgTAP). "Also draft" is off by default so a run costs one call per side. Checked in the browser with both sides on "Jev only" while jevos was down (errors shown, 0 AI calls); a run with real calls is still to do.

- [x] **T25. Business profile for classification**
      `tenants.business_profile` (text, length cap, owner-editable in Settings → Business, versioned in each classification's audit details). Pass it to both classifiers instead of the business name; remove "local business" from the LLM classifier prompt (bump `LLM_CLASSIFY_PROMPT_VERSION`). `pnpm triage:report` reads the same field so tests match production. Add a labeled digital-product set (and one more niche). Measure "name only" against "profile" in the Lab before switching.
      _Done when:_ both classifiers receive the profile, the report runs on the new sets, and the Lab comparison is recorded in TDD §9.6.
      _Status (2026-10-30):_ built and tested (unit, integration: the job sends the profile and records `businessContext`). Settings → Business has the profile form; the Lab has a "Saved profile" context. **Open:** the name-only vs profile measurement (needs jevos or paid calls; commands in TDD §9.6), so the box stays unchecked.
      _Result (2026-11-05):_ measured on local jevos (TDD §9.6): the profile made Jev worse on every set (digital products 56→40%, salon 75→60%, café 52→47%). Production Jev now gets the business name only (`JevClassifier` `businessContext: "name"`); the LLM fallback and drafting keep the profile. The Lab and the report still measure either.

- [x] **T26. Owner practice box**
      "Try a message" in Settings → Replies (and a later onboarding step): the tenant's current setup only, through the T23 engine. One plain card: what it looks like, the reply it would send, "Used your info: …", what happens next ("I'd ask you first"), or why it would pass to the owner with "Add an answer". No scores or model names (design.md principle 5). "Right / Not quite" saves a correction. Daily try limit per business, shown in the box. "Practice only. Nothing is posted."
      _Done when:_ a covered question shows a reply, an uncovered one offers "Add an answer", a complaint says it always comes to the owner, the limit holds, and nothing is written to the inbox.
      _Note:_ the card copy is a pure, tested function (`practiceCard`); the integration test runs a full practice preview against the local DB with faked AI and checks nothing but `practice` usage is written, and the limit (20 per rolling 24 h, `lab_runs.origin = owner`). Corrections go to `lab_cases` (set "Owner checks", origin owner) with an audit row. The onboarding step and AI-written sample messages are not built (static examples instead). Not yet pressed with real AI calls.

- [x] **T27. Readiness and promises**
      Settings → Replies, per category: last 14 days of drafts (sent as written, edited, rejected) and a plain "Ready to reply on its own" / "Not ready yet" line with "See the ones you edited" (draft next to what was sent). Advice only at first; thresholds in one constant (start: at least 10 sent, at most 1 in 10 edited). A "What your receptionist will never do" list, each line tied to a rule in code. Sent filter for replies sent on their own, and a "Pause all replies" switch.
      _Done when:_ the card's counts match the drafts table for a seeded tenant, and pausing stops sends for that tenant.
      _Note:_ `tenants.replies_paused` (owner-editable). While on, `policy()` turns auto-send into `approve` (`replies_paused`) and the send step holds owner-approved replies with `RetryLaterError(120 s)`, no attempt counted; no status changes from the switch itself. The inbox shows a paused notice; Sent has an "All sent / Sent on its own" filter. Readiness counts only owner-decided drafts (auto-sent ones don't count); thresholds in `readiness.ts`. Integration tests: readiness counts, paused send held then sent, paused auto reply back to the owner.

- [x] **T28. Lab batch compare and draft checks**
      Lab tab 2: pick labeled sets and variants A and B; show the call count and cost before running (warn above the free daily limit); results per category for A and B and a list of messages whose result changed. Draft checks that cost nothing: grounding passes, `needsHuman` when the facts don't cover the question, length and language rules. Also a CLI form for CI-style runs. LLM-as-judge later (paid or local).
      _Done when:_ a batch run on the labeled sets shows both variants' accuracy and the changed messages, and the draft checks run on the drafting samples.
      _Note:_ Lab tab "Compare on a set": repository sets (café, digital products, salon; local only, they live in `tests/`) and saved sets (`lab_cases`); 5 messages per server call with Stop; the estimate counts OpenRouter requests (LLM and Jev-via-OpenRouter always, production only when Jev fails) and asks to confirm above the free 50. Draft checks (`features/drafting/checks.ts`): grounding, needsHuman vs the sample's covered/NOT covered note, length, emoji, language, no contact details in comments. `pnpm draft:preview` prints them per sample (real calls); `pnpm draft:check` runs them over saved drafts with no AI calls (on the demo seed: 11 of 47 checks fail: emoji 8, length 3, in hand-written seed drafts). Checked in the browser with both setups on Jev while jevos was down: 20 messages, 4 chunks, 0 AI calls. The CLI form for CI is `draft:check`; a classification batch CLI is `triage:report`.

- [x] **T34. Admin role on the login**
      Replace the `OPERATOR_EMAILS` list with a role in the user's Supabase `app_metadata` (`role: "operator"`): only the server can set it, owners can't edit it. Nobody is an admin unless granted, locally too (no "everyone locally" default). `pnpm local:operator --email you@x [--remove]` grants or removes it on local Supabase. Admin pages (`/admin/lab`, `/admin/costs`), their actions and the sidebar entries check the role. Owner roles (staff) are not in scope.
      _Done when:_ an owner without the role gets a 404 on admin pages and sees no admin entries; granting the role shows them; unit tests cover the check.
      _Note:_ `isOperator()` reads `app_metadata.role` only (never `user_metadata`, which users can edit). Supabase merges `app_metadata` updates, so `--remove` sets the role to null. Checked: grant and remove on the local test login (it ends with no role).

- [x] **T35. Owner Lab (`/lab`)**
      The owner's own page, in plain words: "Try a message", "Ready to reply on its own?" per kind of message with "See the ones you edited", and "What your receptionist will never do". Settings → Replies keeps only the switches (modes, Pause all replies) and links to it. Sidebar: "Lab" for owners; the admin page is listed as "Admin lab".
      _Done when:_ an owner sees Lab in the sidebar and the page works; Settings → Replies no longer holds the practice box or readiness.
      _Note:_ checked in the browser as the test owner (no admin role): sidebar shows Lab and no admin entries, `/admin/lab` is a 404, `/lab` shows the practice box, readiness (picked up the live-test draft) and the promises; Settings → Replies has the switches and a "Try it in Lab" link.

- [x] **T36. Owner Lab v2 (design v2 canvas, row 4)**
      Try on the left, the verdict on the right. (1) Readiness shows progress and, when ready, "Turn on Auto-send" with a one-time confirm. (2) When not ready, changes grouped by the Business info topic the reply used, with "Fix in Business info". (3) "Your recent messages": the last 5 real messages through today's setup, next to what happened then (one try each). (4) Example messages built from the business's own topics; generic ones only without topics. (5) Recent tries stay on the page. (6) "Right / Not quite" says honestly what it does. (7) A first-day checklist until setup is done. (8) "Based on" names only the best match; a buyer's try shows what would be saved to Leads.
      _Done when:_ each item works on /lab, pure logic (examples, checklist, readiness grouping, card copy) has unit tests, and recent messages never send or change an item.
      _Note:_ examples use keyword rules on topic titles (`examples.ts`, no AI). Readiness groups changes by the draft's first `kb_entry_ids` entry (its best match). "Turn on Auto-send" reuses `updateAutonomyMode` (audited) after an in-place confirm. Recent messages: `recent-messages.ts`, integration-tested with a fake runner (items and drafts unchanged, one try stored per message). Checked in the browser as the test owner: checklist 3 of 5, examples from topics, readiness, recent tries. Not pressed with real AI calls by me.

- [x] **T37. Quick wins after the live test (2026-10-30)**
      Needs you: a message the receptionist wasn't sure about says what it looked most like and offers "It's spam: hide it" (handled, audited as `item_hidden_as_spam`). "Open in Instagram/Facebook": comments store the post link from the webhook (`inbound_items.permalink`, https only), DMs open the platform's inbox. Sign-in links opened through a tunnel redirect to the tunnel address (forwarded host), not https://localhost. Demo seed replies follow the draft rules (no emoji unless the customer used one, comments at most 2 sentences).

- [x] **T38. Landing page at `/` (2026-11-03)**
      The marketing page, from "Landing E" and "Landing G" on the Waggle screens v3 canvas: Landing A's calm editorial layout stripped of the template tells (no eyebrow pill, no section nav, one hero button, no kicker labels, no boxes, no background bands, no pricing card), Landing C's wide bee dance under the headline, the whole product (Post and schedule, Replies, Leads) with unboxed previews, "Set up in an afternoon", what Waggle will never do, "Next, with our pilot businesses" (unbuilt features labelled Coming / In pilot), one pilot plan. `src/features/landing`; `src/app/page.tsx` renders it statically and a Suspense-wrapped `SignedInRedirect` still sends a signed-in owner to `/inbox`. `BeeDance` in `components/app/bee.tsx` (SVG motion so it scales; reduced motion shows a still bee). **The flight path** (`flight-path.tsx`, geometry in `flight-geometry.ts` with unit tests): one dotted trail measured from the real layout runs from the hero figure-8 down the gutter between the two columns (a gentle sway inside the 64px gap, never under text) and lands beside the pricing button; the bee's position is the scroll position, eased; the honey draws behind it; the hero keeps its own loop until the path bee has somewhere to go, and the hand-off waits for the looping bee to pass the figure-8's center (so a small scroll never freezes it); back at the top the loop restarts from the center. Under 768px, with reduced motion (static trail only) or without `offset-path`: no moving bee.
      _Done when:_ `/` renders the page signed out, a signed-in owner lands on `/inbox`, nothing overflows at 390px, the bee follows the scroll and lands at the button.
      _Note:_ price is a `[YOUR PRICE]` placeholder and Privacy / Terms / Contact links are `#` until those pages exist. Checked in headless Chrome at 1440 (bee at the reading line at five scroll positions, trail in the gutter, landing at the button) and 390 (no horizontal overflow, no path). A first version routed the path through the page margins and around each preview; the sweeps crossed the content between rows, so the gutter won. The signed-in redirect is the same `auth.getUser()` check the dashboard uses, not pressed in the browser on this machine (local Supabase not configured here yet).

- [x] **T39. Logo: the waggle as a W (2026-11-03)**
      The figure-8 mark read as an infinity loop beside a lowercase wordmark (Metricool). New mark, option B on the canvas's "Logo options" board: a honey wave that starts high, dips twice and rises into an ink bee dot, so it reads as a W. `components/app/brand.tsx` (`Mark`, inline, tokens; `Brand` = mark + `waggle` without the full stop), the four files in `public/brand/`, `src/app/icon.svg`, design.md §2. The figure-8 stays in motion (loading, the sent trail, the landing page's dance and flight path).
      _Done when:_ the top bar, auth pages, 404 and landing page show the new lockup and the favicon is the mark on ink.

Follow-ups from the 2026-10-30 review (after Phase 5 starts paying off):

- [x] **T29. Prompt safety and version records:** escape or strip the `<message>` delimiters in customer text (draft prompt and LLM classifier); record `JEV_QUESTIONS_VERSION` / `LLM_CLASSIFY_PROMPT_VERSION` with each classification.
      _Note:_ `asMessageData()` (`lib/llm/prompt-data.ts`) replaces any `<message>` / `</message>` tag the customer typed (any case or spacing) with `[tag removed]`; the prompt wording is unchanged, so no version bump. The classify step's status_changed row records `promptVersion` (Jev's question version when Jev answered, the LLM prompt version when the fallback did).
- [x] **T30. Thread history:** the last few messages of a DM thread go into the draft prompt and the retrieval query (bounded: more customer text reaches the AI providers).
      _Note:_ draft prompt 2026-10-30.1: up to 4 earlier messages (customer messages and sent replies, 300 characters each) in an `<earlier>` block before the latest message, with rule 8 (context only, facts still only from Business info); tags neutralised like `<message>`. Retrieval searches the latest message plus the customer's previous one. Comments have no thread. The 2026-10-29.1 prompt stays in the Lab. `draft_created` records `historyMessages`.
- [x] **T31. Relevance floor:** a minimum similarity in `match_kb_entries`, tuned with T28, not by feel.
      _Note:_ applied in `retrieveKbEntries` (no migration): `RETRIEVAL_MIN_SIMILARITY` 0.25, `KB_MIN_SIMILARITY` overrides it. Tuned on the live test's Lab tries (right topic 0.48 to 0.52, unrelated 0.07 to 0.13 with the free nvidia embedding model); only 4 tries, so `draft_created` now records `kbSimilarities` to retune on real messages. Retune when `EMBEDDING_MODEL` changes. If nothing clears the floor, the prompt gets no facts and the draft goes to the owner.
- [x] **T32. Monthly AI spend cap per business** from `ai_usage` (live and practice; lab excluded).
      _Note:_ agreed 2026-10-30: at the cap messages are still sorted (classification runs, spam still hidden) but nothing is drafted; they go to Needs you as `ai_cap_reached`. A reply already drafted goes on as usual. Cap: `tenants.ai_monthly_cap_usd` (operator only, set on /admin/costs, audited `ai_cap_changed`), blank = `AI_MONTHLY_CAP_USD` (default $20); 0 turns drafting off. Month = calendar month, UTC (until tenants have a time zone). The owner sees an amber line in the inbox from 80%, in words, not dollars; the Practice box says so too. Lab runs ignore the cap. With today's free models every call costs $0, so the cap can't be reached in practice yet.
- [x] **T33. First agent: business-info gap helper:** groups "Questions your info didn't answer" and drafts new topics for the owner to approve. Needs a tool-calling method in `src/lib/llm` that records `ai_usage` per step and caps steps.
      _Note:_ `LlmClient.runTools` (draft model, `stepCountIs`, one `ai_usage` row per model call with purpose `agent`, hard cap `AGENT_MAX_STEPS` 6; a run still calling tools at the cap fails, its calls stay recorded). The helper (`knowledge-base/gap-helper.ts`, version 2026-10-30.1) has three read-only tools: `list_unanswered_questions`, `list_topics`, `find_topic` (retrieval). Rule 8: it never writes a fact. A suggestion is a title plus wording with `[...]` blanks; wording with a digit, currency sign or no blank becomes a plain `[...]`; saving a topic with a `[...]` left is refused, so nothing reaches a draft until the owner fills it in. Owner flow on Business info: "Suggest topics" (2+ unanswered questions, 3 runs a day, monthly AI cap applies, calls count as live) → "Suggested topics" with "Add this topic" (opens the editor prefilled; saving accepts it, audited `kb_suggestion_accepted`) or "Not needed" (`kb_suggestion_dismissed`). New table `kb_suggestions` (owners read via RLS, service role writes). Tested with a fake OpenRouter only; whether the free models call tools properly is still to check with one real run.

## Phase 6: More of Instagram and Facebook

Picked 2026-11-05 from the Zernio docs (docs.zernio.com, `zernio-docs` MCP) and the coverage page (https://claude.ai/artifact/4FL1eUcsHtT1EhLr5hM7Gd). All three go through `SocialProvider` (rule 1) and the mock provider gets the same methods.

- [ ] **T40. Hide spam comments on the platform**
      Today "It's spam: hide it" (T37) only hides the item inside Waggle; the comment stays public on the post. Add `hideComment` / `unhideComment` to `SocialProvider` (`POST /v1/inbox/comments/{postId}/{commentId}/hide` with `accountId`; unhide is `DELETE` on the same path). The owner's "It's spam: hide it" also hides it on Instagram/Facebook, with "Unhide" next to it. Decide: should a comment Jev marks as spam (above `SPAM_YES`) be hidden automatically, behind a Settings switch that is off by default? Comments only (DMs can't be hidden). Audit `comment_hidden` / `comment_unhidden` with the outcome; a `400 PLATFORM_API_ERROR` (comment already gone) is shown in place, not retried.
      _Done when:_ hiding from the inbox hides the comment on the platform (checked on a test post), Unhide reverses it, both are audited, and unit tests cover the provider call and the error mapping.
      _Status (2026-11-05):_ built to the approved design v3 artboard. Decision taken: yes, behind "Hide spam comments for me" (Settings → Replies, off by default, only at or above the confidence threshold). Without it a spam comment now comes to For you to hide (it used to go straight to Ignored while staying public). Migration `20261105120000_hide_spam` (`tenants.auto_hide_spam`, `inbound_items.hidden_on_platform_at`). Unit tests: policy, adapter (hide/unhide paths, 400 mapping), error outcome, row notes, today line. Integration test `tests/integration/hide-spam.test.ts` (job auto-hide, not sure, hide failure, DM, owner hide/unhide, already gone, other tenant, not spam): passes (2026-11-06). **Open:** check on a real test post that the comment hides and unhides; then check the box.

- [ ] **T41. Private reply to a comment**
      Answer a comment in the commenter's DMs instead of in public, for prices, bookings and anything personal (`POST /v1/inbox/comments/{postId}/{commentId}/private-reply`, Instagram and Facebook only). One per comment, within 7 days of the comment. On approval the owner picks "Reply publicly" or "Reply in DM"; the draft prompt gets a DM variant (bump the draft prompt version). Still passes `policy()` (rule 6). Errors: `400` with `details.privateReplyConsumed: true` means spent, never retry; `502` with `privateReplyOutcome: "unknown"` means check the conversation before anything else (rule 7), so this needs a reconcile step, not a retry. Send text only at first: Instagram can refuse buttons to non-followers and that still spends the reply. The commenter's answer arrives as a normal DM (`message.received`) and joins that conversation.
      _Done when:_ a comment can be answered by DM from the inbox, the item shows where the reply went, a spent or unknown outcome never sends twice (unit tests on the error mapping), and it is audited.
      _Status (2026-11-05):_ built to the approved design v3 artboard (TDD §7.4 "Reply in DM"). Waggle picks DM for leads' comments; the owner can switch. Reconcile = Meta's one-per-comment limit (no idempotency key on this endpoint). Migration `20261105130000_private_reply`. Unit tests: window and default (`private-reply.test.ts`), adapter (path, consumed, 502), status transition, row notes. Integration tests added to `tests/integration/sending.test.ts` (sent once, 502 then consumed = sent once, already spent → Reply publicly, past 7 days, DM items ignore replyVia): pass (2026-11-06). **Open:** send one real private reply on a test post; then check the box.

- [ ] **T42. Facebook Page reviews in the inbox**
      Reviews (recommendations) on a connected Facebook Page become inbox items: list with `GET /v1/inbox/reviews?platform=facebook&accountId=…`, reply with `POST /v1/inbox/reviews/{reviewId}/reply` (`accountId`, `message`, `Idempotency-Key` header: rule 7). **VERIFY first:** the docs describe `review.new` / `review.updated` webhooks for Google Business Profile only, so Facebook reviews probably need polling from the job runner (dedupe by review id, like comments). New item kind `review` (migration on `inbound_items.kind`, RLS unchanged), classified like comments (a negative recommendation is usually a complaint), drafted from Business info, approved by the owner. A review reply is public and stays on the Page: never auto-send in the pilot, whatever the mode.
      _Done when:_ a new review on the test Page appears in the inbox within the polling interval, a reply approved in Waggle shows on Facebook once, and the new kind passes the RLS tests (`pnpm test:db`).
      _Status (2026-11-05):_ built to the approved design v3 artboard (TDD §7.6). VERIFY resolved from the docs: no Facebook review webhooks, so the job polls every 5 minutes per Page. Migration `20261105140000_reviews`. Unit tests: adapter (list mapping, reply path and key), poller filters, policy (approve even in auto, spam ignored), row notes. Integration test `tests/integration/reviews.test.ts` (stored once, waits in auto mode, posted once, not re-imported) passes, and `pnpm test:db` passes (96 tests) (2026-11-06). **Open:** a real review on a test Page; then check the box.

## Next (held, after Phase 6)

From the same review, agreed 2026-11-05 to hold until Phase 6 is done:

- [ ] **T43. Reply to DMs up to 7 days** with Meta's `HUMAN_AGENT` tag (`messagingType: "MESSAGE_TAG"`, `messageTag: "HUMAN_AGENT"`) instead of escalating when the 24-hour window closes. **Check first:** Meta allows it only for replies typed by a person; decide whether an AI draft the owner approved (or edited) qualifies before using it. Never on auto-sent replies.
- [ ] **T44. Another app owns the conversation** (Meta handover): handle `message.received` with `metadata.standby: true` and a send that answers `409 not_thread_owner` (owner also replies from Page Inbox / Business Suite). Show it in place and don't retry; optionally offer "Take the conversation back" (`set-conversation-thread-control`). Listen to `conversation.control_changed`.
- [ ] **T45. Ice breakers from Business info**: up to 4 starter questions (80 characters each) shown when someone opens a new DM, suggested from the owner's topics and set with `/v1/accounts/{accountId}/instagram-ice-breakers` and `/messenger-ice-breakers`. Owner approves the wording.
- [ ] **T46. Post analytics**: reach, likes, comments and shares per Waggle post (`GET /v1/analytics`), shown on the Posts page; Instagram account insights later.

## Later

- [ ] **T21. Customer offboarding**
      When a tenant leaves: disconnect each of its accounts (`DELETE /v1/accounts/{accountId}`; active accounts block profile deletion with 400), then delete the Zernio profile, then delete or anonymize the tenant's data per the retention policy. Audit each step.
      _Done when:_ offboarding a test tenant leaves no connected accounts or profile on Zernio and no tenant rows here.
