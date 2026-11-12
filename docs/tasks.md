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

- [ ] **T47. Brands: one login, several businesses**
      Like Metricool's brands: a brand switcher in the top bar, each brand with its own connected accounts, Business info, inbox, rules and bill. Decided 2026-11-06: one bill per brand, no combined inbox for now.
      _Done when:_ an owner can add a brand, switch between brands from any page, a new brand starts on "Set up <brand>", and one brand's items never show in another's pages (integration test with one login owning two brands).
      _Status (2026-11-06):_ built to the approved design v3 "Brands" artboards. Migration `20261106120000_brands` (drops the one-tenant-per-owner index, adds `create_brand`). Brand cookie + `getCurrentTenant()` (TDD §4), brand menu with per-brand "needs you" counts and a honey dot when another brand waits, `/brands/new`, the setup screen replaces the inbox's first run, alert links switch brand. Query audit: every RLS-client query already filtered on the tenant except `getCurrentTenant` itself. Tests: unit `brand-pick.test.ts`, pgTAP `owner_tenant.test.sql`, integration `brands.test.ts`. Checked locally in the browser (switch, setup screen, duplicate name). **Open:** add a real brand on production (creates a Zernio profile) and connect its account; then check the box.

## Phase 7: Analytics (base tier)

Approved 2026-11-06 from the design v3 "Analytics" row (Overview, Posts, Audience, Waggle's work, States). Zernio's plan includes analytics (checked with one read call: 200). Per Zernio's multi-tenant guide, pages read our own tables; a sync job fills them and nothing calls Zernio while a page renders, except opening one post's daily timeline (cached). The paid "Insights" screens are a separate idea, not in this phase.

- [ ] **T48. Analytics sync and storage**
      `SocialProvider` gets read methods for the dashboard summary, post analytics (paged), follower stats, best time to post, Instagram demographics and online followers, Facebook demographics and a post's timeline; the mock provider returns steady sample data. Migration: `analytics_snapshots` (per tenant, keyed: dashboards per period and platform, audience per account) and `post_metrics` (one row per post and platform). The job route syncs a due tenant: dashboards and the last 30 days of posts hourly, the full 12 months once and then weekly, audience daily. A `429` waits for the next pass.
      _Done when:_ a connected brand's tables fill on the job, a second pass updates rather than duplicates, RLS keeps them per tenant (pgTAP), and unit tests cover the mapping.
      _Status (2026-11-06):_ built (TDD §7.7). Migration `20261106140000_analytics`. Unit: `analytics-map.test.ts`, `sync.test.ts`; pgTAP: `rls.test.sql` (+4); integration `analytics.test.ts` (fills, not due within the hour, hourly pass updates without duplicates, 429 leaves it due). **Open:** one real sync on production after deploy; the two VERIFY items in TDD §7.7.
- [ ] **T49. Analytics page: Overview** (top-bar "Analytics"; period 7/30/90 days and platform filters; totals vs the previous period, daily chart with the previous period dashed, best posts, reach by platform, "What stood out" from rules, not AI).
      _Status (2026-11-06):_ built to the approved design v3 "Analytics" artboards; previous-period line comes from the 90-day snapshot (none on 90 days, said in place); no Custom period (snapshots exist for 7/30/90). Checked locally with `pnpm analytics:seed` (no Zernio calls). **Open:** real data after deploy.
- [ ] **T50. Analytics: Posts** (sortable table, made in Waggle or on the platform, type filter, CSV, post detail with the first 14 days and what Waggle did with its comments).
      _Status (2026-11-06):_ built to the approved design v3 "Analytics" artboards; post detail opens on click only (its timeline is the one live Zernio call, cached 6 h, then kept once 14 days settle); the composer now takes `?time=HH:MM` for "Schedule a post for …". Checked locally with `pnpm analytics:seed` (no Zernio calls). **Open:** real data after deploy.
- [ ] **T51. Analytics: Audience** (followers per platform, when Instagram followers are online, best times to post, age and gender, cities and countries).
      _Status (2026-11-06):_ built to the approved design v3 "Analytics" artboards; best times shown in the viewer's time; the online-followers grid says Meta doesn't name its time zone. Checked locally with `pnpm analytics:seed` (no Zernio calls). **Open:** real data after deploy.
- [ ] **T52. Analytics: Waggle's work** (from Waggle's own tables: messages in, replies by Waggle vs you, time to first reply, leads, time saved at an estimated 2 minutes a reply, what came in, most asked topics, where Waggle needed you). No "won" count: leads have no outcome yet.
      _Status (2026-11-06):_ built to the approved design v3 "Analytics" artboards; "Answered by Waggle" = sent with `decided_by` null (same as the inbox's `by=auto`); most asked from `kb_entry_ids` on sent replies; reasons from audit-log escalations. Checked locally with `pnpm analytics:seed` (no Zernio calls). **Open:** real data after deploy.

## Phase 8: Organizations and teams

Decided and approved 2026-11-10 (access-model page + design v3 row "Organizations"). Plan and role matrix: `docs/orgs/PLAN.md`. Replaces T47's "one bill per brand": the organization owns the bill.

- [ ] **T53. Organizations data model**: organizations, members (four roles, "only these brands"), invites by email; `tenants.organization_id`; `tenant_members` kept as the effective access list, rebuilt by one sync function; backfill one personal organization per existing owner.
      _Done when:_ pgTAP covers RLS and every function (last owner, brand limits, invite expiry and email match), and an integration test shows a member limited to one brand never reads another brand's items.
      _Status (2026-11-10):_ migrations `20261110120000_organizations` (+ `…120100` OAuth block). Direct inserts into `tenant_members` (seed, tests, scripts) become organization membership through a trigger, so old paths keep working; `create_brand` now adds to the personal organization. pgTAP `organizations.test.sql` (33), integration `organizations.test.ts` (4), all existing suites pass. Local backfill: every brand got its owner's personal organization. Not pushed.
- [ ] **T54. Sign-up with a personal organization, and the Organization / Brand switcher**.
      _Status (2026-11-10):_ sign-up asks name, email, password (10+); sign-up, login and confirmation make the personal organization (no brand). `/welcome` (no brand open: "Add your first brand", "Create another organization") and `/orgs/new` in a `(setup)` layout with an organization menu. Switcher next to the logo: organizations (role, "1 of 2 brands") and the viewed organization's brands; organization cookie `waggle_org`; `getCurrentTenant` returns `organizationId` and `role` and sends brandless organizations to `/welcome`. Add a brand goes into the open (or picked) organization via `create_brand_in_org`. Unit `pickOpenBrand`, `chooseOpenOrg`. Browser check pending.
- [ ] **T55. Roles enforced**: abilities matrix; every Server Action and write policy checks the role; UI hides what a role can't do; Settings split into Organization and Brand.
      _Status (2026-11-10):_ `getTenantFor(ability)` in every brand Server Action (replies/spam/undo: member+; reply rules, business info, practice, business profile: admin+; posts: member+; connect: admin+). Migration `20261110130000_role_write_policies` (writes through RLS by role; pgTAP `role_writes.test.sql`, 9). `RoleGate`/`ReadOnlyNote`: disabled controls under a note for roles that can't change them (Replies, Business, Accounts, Business info, Lab practice, inbox decisions, composer). Alerts: disconnects to owners/admins, messages to owners/admins/members. The Settings split lands with T56/T57 (their sections are the Organization group).
- [ ] **T56. Team page and invites**: invite panel, invite email, join page for an email with no login, invite states.
      _Status (2026-11-10):_ Settings now has an Organization group (Team) above the Brand group. Team: members with role menu (saves in place), "Change brands", "Remove" (confirm in place), last active; invites with Resend / Copy link / Cancel; invite panel (Admin/Member/Viewer, all or only these brands). Invite email through the shared mailer (`src/lib/email`, moved from alerts): "Create your login to join" or "Join". `/invite/[token]`: join or decline, sign up with the email locked (joins at once with a session), sign in to join, other email, expired, cancelled/closed, declined, already in. `/welcome` lists waiting invites. Tokens: 32 random bytes, only the sha256 stored. Migration `20261110140000_invite_helpers`; pgTAP `invite_helpers.test.sql` (8); unit `invite-email.test.ts`. Browser check pending.
- [ ] **T57. Organization settings and pictures**: rename, picture, billing counts (Owner only), leave, close, only-owner rule; brand picture from a connected account, an upload or initials.
      _Status (2026-11-10):_ Settings → Organization → General (picture + name, leave, close with the name typed, "You're the only Owner") and Billing (brands and connected accounts counted; card and invoices Owner only, "comes with billing (T15)"). A personal organization can't be closed or left. Pictures: public `pictures` bucket, fresh unguessable path per change, server-only writes; the browser crops to a 512 px square in place (`components/app/picture-picker.tsx`; originals up to 10 MB, stored file ≤ 2 MB). Brand picture in Settings → Business: account picture (Zernio `listAccountPictures`, copied by the hourly account check, replaced when the link changes), upload, or initials. Switcher: organizations rounded squares, brands circles. Migrations `20261110150000_pictures`, `…150100` (picture_account_id without FK: it made tenants↔social_accounts embeds ambiguous). Unit `brand-picture.test.ts`, Zernio adapter test; integration `pictures.test.ts`. Browser check pending.
- [ ] **T58. AI assistants by role**: MCP tools follow the member's role (viewer read only).
      _Status (2026-11-10):_ every "act" tool names its ability (`replies.approve` for approve/write/undo/resolve/hide, `posts.write` for create/cancel post); `resolveBrand` checks it against the user's role in that brand and answers `role_not_allowed` (viewers' assistants only read). Unit tests in `context.test.ts` and `registry.test.ts`.

## Phase 9: All Zernio platforms

Plan: `docs/platforms/PLAN.md`; research `docs/platforms/RESEARCH.md`; designs approved 2026-11-12 (canvas pages "Waiting for approval" → Platforms, and "Platform limits").

- [ ] **T59. Wave 1: platform table, connect, posting** for every platform Zernio offers.
      _Status (2026-11-12):_ `src/lib/social/platforms.ts` (one entry per platform: label, mark, kind, connect method, post rules, inbox abilities, `inboxLive`, `analyticsLive`). Migrations `20261112150000_all_platforms` (platform checks widened; pgTAP `platforms.test.sql`) and `…150100_post_consent` (`posts.tiktok_consent_at`). Settings → Accounts: tiles grouped Answers messages / Posting only / Coming soon; OAuth platforms connect through Zernio, Bluesky/Telegram/WhatsApp/Discord show "Coming soon" until their setup steps are built. Composer: per-platform "Before it goes out" (`features/publishing/post-rules.ts`), counter = shortest limit of the picks, strictest image size, TikTok consent tick; `createPost` refuses blocked platforms, then runs Zernio's `POST /v1/tools/validate/post` (`SocialProvider.validatePost`) and shows its reasons in place; if the check itself fails the post is saved and publishing reports it. Inbox, backfill and per-platform analytics stay on Instagram/Facebook (`inboxLive`/`analyticsLive`). Labels everywhere come from the table. Not yet: video upload (YouTube needs it), Pinterest board choice (Zernio uses the first board), setup steps, live test with a real non-Meta account.
- [ ] **T60. Wave 1b: setup steps**: Bluesky app password (`POST /v1/connect/bluesky/credentials`), Telegram bot code, WhatsApp hosted signup, Discord channel.
      _Status (2026-11-12):_ **Bluesky built.** Its tile's Connect opens the form in place (`/settings?section=accounts&setup=bluesky`, `features/accounts/bluesky-setup.tsx`): handle + app password go to `SocialProvider.connectBluesky` (state `{currentUserId from GET /v1/users}-{profileId}`, user id cached) and are never stored or logged. The account is listed at once through `handleAccountConnected` (the webhook that follows is a no-op); a refused password (400/401/403) says to use an app password, 402 is our plan limit, another brand's account is refused. Registry: `connect: "password"`. Tests: unit, adapter, integration `bluesky-connect.test.ts`. Not yet: live test with a real Bluesky account; Telegram, Discord, WhatsApp.
      _Status (2026-11-12, later):_ **Telegram built.** Its tile opens a code card (`telegram-setup.tsx`): `GET /v1/connect/telegram` gives a 15-minute code for `@LateScheduleBot`; the card checks `PATCH /v1/connect/telegram?code=` every 4 s. The code is posted in the channel, so anyone there can read it: the account is recorded only when Zernio lists it on this brand's own profile (else "foreign"). Telegram's inbox stays off (Zernio's docs disagree on which messages arrive). **Discord blocked (VERIFY):** after the bot install Zernio doesn't document how we learn the server (`guildId`) for `POST /v1/connect/discord`, and every Discord post needs a `channelId`; check with Zernio before building. **WhatsApp held** until its inbox (24 h window, templates, Meta billing).
- [ ] **T61. Inbox wave 1**: Google reviews, Threads comments, TikTok comments and DM replies (10 in 48 h).
      _Status (2026-11-12):_ built with T62. `inboxLive` on for Google Business, TikTok, Threads (and YouTube, LinkedIn, Bluesky). Per-platform rules in `inboxRules()` (`lib/social/platforms.ts`): hide (Meta, Threads, TikTok, X), private reply (Meta), DM window (Meta 24 h; TikTok 48 h and 10 replies, counted from sent drafts since the customer's last message; Bluesky none), reply length, whether Zernio lists a comment's replies (Meta, TikTok). Google reviews: `review.new` webhook → `review` item with `review_rating` (migration `20261112170000_review_rating`); card "Reply on Google" with "Google keeps one reply per review"; stars on the row. Policy: `dm_reply_limit`; spam on a platform that can't hide is ignored. Our own replies coming back as comments are skipped by handle and by `drafts.zernio_reply_id` (Zernio flags them only on Meta). Drafting prompt `2026-11-12.1` names the platform and its reply length; a longer draft goes to the owner. **To do by hand:** add `review.new` (and later `review.updated`) to the Zernio webhook's events. Not yet: `review.updated` (a reply made in Google), the "comments checked every few minutes" note (needs a design), a live test.
- [ ] **T62. Inbox wave 2**: YouTube, LinkedIn, Bluesky, X (cost decision first).
      _Status (2026-11-12):_ YouTube, LinkedIn and Bluesky comments and Bluesky DMs are on (no hide there: spam is left out). **X stays off** until the per-call cost is decided (comments must be pulled, not pushed; DM read $0.010, send $0.015). Bluesky replies use Zernio's defaults for `parentCid`/`rootUri` (VERIFY in the live test).

- [x] **T63. Video upload** (design approved 2026-11-12, canvas "Next to build" · NextComposerMedia).
      _Built 2026-11-12:_ the browser uploads the video straight to Zernio's storage (`SocialProvider.presignMedia`, then a PUT with progress; Zernio's R2 storage allows any origin, checked with one real presign call on 12 Nov), so videos never pass through our server (Vercel's 4.5 MB body limit). Our cap 1 GB; MP4, MOV, WebM, M4V. The compose action only accepts a video URL on `media.zernio.com` (or the mock's own route). A post has a photo or a video. Length checks per platform (`videoMaxSeconds`: Instagram 15 min, TikTok 10, Threads 5, Bluesky 60 s) from the length the browser reads. YouTube title field when YouTube is ticked, kept in `posts.platform_options` (migration `20261112190000_post_platform_options`) so scheduled and retried posts carry it. TikTok asks for its video options (`mediaType=video`). Not yet: a live test with a real YouTube/TikTok account.
- [x] **T64. Pinterest board choice** (approved; NextComposerMedia).
      _Built 2026-11-12:_ "Before it goes out" shows where pins go ("pins to “Coffee menu”" or "your first board") with Change board, which opens the picker in place (`board-picker.tsx`). Boards come from `GET /v1/accounts/{id}/pinterest-boards` (`listPinterestBoards`); the choice is checked against that list and saved on the account (`social_accounts.pinterest_board_id/_name`, migration `20261112200000_pinterest_board`, audited). Each post keeps the board it was made with in `platform_options.pinterest.boardId`; Zernio gets `platformSpecificData.boardId`.
- [x] **T65. Replies made on Google** (approved; NextInboxNotes).
      _Built 2026-11-12:_ `review.updated` with `hasReply` on a review Waggle hasn't sent (or isn't sending) means the owner replied in Google: new status event `answered_elsewhere` → `handled`, `inbound_items.answered_on_platform_at` set (migration `20261112210000_answered_on_platform`), the pending draft rejected, audit `answered_on_platform`. Zernio also fires `review.updated` after our own reply, so a review in sending/sent is left alone. Row "You replied on Google Business"; footer "You replied on Google Business yourself, so Waggle's draft wasn't sent." Change from the design: it stays where handled items go (Ignored tab), not Answered, to keep "Mark as handled" unchanged. **To do by hand:** add `review.updated` to the Zernio webhook's events (Google checks for replies made in Google within about 6 hours).
- [ ] **T66. Account lines and slower-comments note** (approved; NextAccountBadges, NextInboxNotes).
- [ ] **T67. WhatsApp** (approved; NextWhatsApp): connect, 24 h window, templates (send, list, new), Meta charges note.

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
      _Built 2026-11-09 (tdd.md §20): staff Brands page, 3-month soft delete, restore, hard delete job; tested against the mock and local DB. Still open: one live run on a throwaway Zernio profile (needs an OK for real Zernio calls), then tick._
