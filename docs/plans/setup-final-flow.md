# Setup, start to finish: build plan (approved 23 Nov)

Board: "Setup, start to finish" on the Waggle screens v3 canvas (page "Review now"). Source of the board:
`C:\Users\Febron Sedoriosa\AppData\Local\Temp\claude\06af2803ae73ffbb\0f246282-acaf-4a73-95cb-1df5650b100a\setup_flow_board.py`
(readable Python that draws every screen and state; the rendered HTML is
`C:\Users\Febron Sedoriosa\OneDrive\Documents\Zen Companies\zernio-new-project\.canvas-tmp\project\RSetupFlow.dc.html`).
The board is the spec. Copy is as on the board. Follow docs/design.md (tokens, no toasts, feedback in place,
§4.3 StateMark hexagons, §4.4 EmptySpot/EmptyCell, §6 bee moments, red only for problems).

Status legend: [ ] todo, [x] done. Update this file as you go.

## Part A: Connect (step 1) and connecting
- [x] A1 Loading: `src/app/(setup)/loading.tsx` and the Suspense fallbacks in `setup/page.tsx` and `welcome/page.tsx` use the approved `PageLoading` (bee + 3 combs filling), not grey skeletons.
- [x] A2 /welcome coming-soon tiles: dashed border + `StateMark state="soon"` (dashed hexagon) + "Coming soon", as `accounts/connect-tiles.tsx` does; not opacity-60.
- [x] A3 Connect tile pending: after a tap the tile/button shows the bee + "Opening Instagram…" (useFormStatus) until the redirect.
- [x] A4 "Before you connect <Platform>" note in place before leaving for the platform (bee, two hexagon ticks: business or creator account; the account customers message; button "Continue to <Platform>"). Reuse `connect-note-box.tsx` if it fits; for Instagram/Facebook only (where personal accounts fail).
- [x] A5 Free with its 1 account used: in-place card (bee, "Free connects 1 account. Solo connects 3.", See Solo) instead of a silent redirect.
- [x] A6 Connecting screen (`/setup?connecting=x`): new client component. Platform icon → dashed line with the bee flying → Waggle mark; "Connecting Instagram…" / "Usually a few seconds." It checks by itself: poll a small GET endpoint (e.g. `/api/setup/connected`, auth + getTenantFor, returns whether the brand has an active account) every 3 s and on focus; when connected, `router.replace("/setup")`. After 60 s: "Still connecting" / "Instagram can be slow. You can wait here or come back." + Check again (keeps polling). Stop polling after 10 min.
- [x] A7 Connect errors reach setup: `setup/page.tsx` passes `error` through. Personal account → red box "That’s a personal Instagram" / "Switch it to business or creator in Instagram’s settings." + "I switched, try again" + "Pick another". Cancelled → "Instagram sign-in was cancelled" + Try again. Reuse the copy/logic from commit 0f9070f (the /welcome personal-account box).
- [x] A8 Webhook fallback: if still not connected after ~20 s, the endpoint may reconcile through `SocialProvider` (listAccounts for the brand's profile → handleAccountConnected). Only if it's already supported cleanly; otherwise skip and note it. Done with `getAccountsHealth` (the provider's per-profile account list) in `accounts/connect-reconcile.ts`, called by `/api/setup/connected?reconcile=1` after 20 s, at most every 15 s.

## Part B: See what you missed (step 2, one page)
- [x] B1 Reading keeps going after Next: lift polling out of `ReadingPart` so it runs while any part is open (e.g. a provider around `Unfold` or polling inside Unfold's parent client component); parts 2 and 3 fill in live; `router.refresh()` once ready.
- [x] B2 Unfold keeps the right part open when the parts list changes after refresh (sync `open` by screen id, not index).
- [x] B3 Reading tiles: plain tone; "–" + "known when sorted" for still-waiting until sorted; "still counting…" notes (done). Red only for a non-zero "no reply" once read. Zero month: tiles 0 and "A quiet month. Waggle answers new messages from now on."
- [x] B4 Reading stalled/error state: if progress hasn't changed for a long time or fetches fail, say so in place with Check again (no endless spin).
- [x] B5 "What they wanted" empty: EmptySpot-style card with 3 empty combs, "Nobody was left waiting" / "Every message in the last 30 days got an answer."
- [x] B6 "Waggle’s replies": example exchange, "N replies ready · M need you" with honey combs; states: still writing (bee + "Writing replies · 2 of 5" + combs), nothing to answer (empty combs card + "Next: how replies go out"), out of AI replies (honey banner, bee, "Out of AI replies this month. N messages wait for you." + Add replies). The last button's label matches where it goes.
- [x] B7 "Need you" counts escalated items with no draft (complaints, unclear, AI cap, out of replies) as well as needs_human drafts (setup-data.ts `waiting`).

## Part C: Check Waggle’s answers (step 3) and the end
- [x] C1 Batch: after Send, in-place "Sending N replies…" with the flying bee and Undo for 8 seconds, then they go. Nothing ticked: "Tick at least one to send" beside a disabled Send, and Skip.
- [x] C2 Need you: shows escalated-without-draft items too (complaint first); "Answer later in Inbox"; screen skipped when nobody needs you. Copy says "Waggle", not "I".
- [x] C3 How replies go out: Free "Reply on its own" uses the plan bee pill (bee + Solo, honey tint) like the plan pills (§8), tap opens the Solo offer in place.
- [x] C4 End: "Finish setup" leads to an end screen in the setup frame: dancing bee (BeeDance), "You’re set up, <first name>", list with honey hexagons (connected platform, replies sent, the reply choice, anything waiting in Inbox), one button "Go to my Inbox". (Today finishSetup redirects to /inbox?welcome=1 and nothing reads it.)
- [x] C5 docs/design.md §6: update the setup bee moments to this flow.

## Rules
- Work in `C:\Users\Febron Sedoriosa\OneDrive\Documents\Zen Companies\waggle-billing` (branch local-test, uncommitted work is intentional: do not commit, stash, reset or checkout).
- `pnpm dev` is running there: do NOT run `pnpm typecheck` or `next typegen` (reload loop). Check with `npx tsc --noEmit`, `npx eslint <files>`, `npx prettier --write <files>`, `npx vitest run <files>`.
- Pure logic gets unit tests next to it. Client components must not import feature barrels that re-export server code (import pure modules directly). Cache components: pages reading searchParams need Suspense. No ref reads during render.
- Never call Zernio directly (SocialProvider only); no real Zernio/AI calls in tests.

## Part D: Step 2 plays like a story (approved 23 Nov, board "Step 2 plays like a story, then shows everything")
Board source: `C:\Users\Febron Sedoriosa\AppData\Local\Temp\claude\06af2803ae73ffbb\0f246282-acaf-4a73-95cb-1df5650b100a\step2_story_board.py` (rendered: `.canvas-tmp/project/RStep2Story.dc.html` in zernio-new-project). Change vs the board: NO "What's Meta's 24-hour rule?" link; the red card says in one line "Instagram and Facebook only let a business reply within 24 hours."
- [x] D1 Step 2 replaces the three Unfold parts + Next buttons with a self-playing story: progress segments on top, pause/play, Skip. Scenes (~5 s each, timer starts when reading is done; while reading the first scene stays): reading (bee flies, strip fills) → your 30 days (strip, bee resting at today) → locked DMs (red card, bee: "First, the ones Waggle can’t save.") → still answerable (honey "N DMs close today. Answer them before Meta locks them." + green "N comments with no reply.", bee: "These you can still answer.") → what they wanted (chips + chat rows) → END summary.
- [x] D2 END summary (stays): title "<first name>, here’s what you missed", sub "<brand>’s <platform>, last 30 days"; strip; the three number cards; What they wanted (short); "Waggle wrote N replies for the X and the Y · M need you" with combs; "With Waggle, we can take care of the X and the Y now. Want to work on them?"; Yes, let’s do it (→ step 3 first screen) and Skip for now (→ how replies go out); "Watch again" replays.
- [x] D3 Strip dates: weekly tick labels under the strip (5 labels, last is "today"), and hover/tap a day column shows a small dark tooltip "Tue 28 Oct · 2 DMs · 1 no reply" (keyboard focusable, aria). Bee rests at today once read.
- [x] D4 States: no locked DMs → no red card, green "0 DMs got locked. Nobody’s chat ran past 24 hours. Nice." in the summary only (skip the scene); platform without past DMs (not Instagram/Facebook) → no locked scene/card, the answerable card shows DMs (if any) and comments; reduced motion or Skip → summary at once; nothing to answer → summary + "Nothing to answer from the last 30 days. Waggle answers new messages from now on." + Next: how replies go out; read-before (d.readBefore) → summary shows that message (existing copy) instead of numbers; stalled reading keeps the B4 box.
- [x] D5 Numbers come from real data: locked = lost DMs (missed_messages), close today = d.missed.closeToday, comments with no reply = d.missed.commentsOpen (check setup-data names). Pure function for the scene list (which scenes, given data) with unit tests.
- [x] D6 Remove now-unused step 2 Unfold wiring (keep Unfold if used elsewhere), keep URL/screen saving sensible (step 2 is one screen "missed"; old ?screen=wanted|replies links open the summary).
- Built 23 Nov: `step2-story.tsx` (client player + scenes + summary), `story.ts` (pure scene list and player reducer, tested), `day-strip.ts` `stripTicks`/`dayTip` (tested), `day-strip-view.tsx` (client: dates, tooltip, resting bee), `combs.tsx`. Removed `unfold.tsx`, `missed-parts.tsx` and `openPartIndex`; `flow.ts` keeps `wanted`/`replies` only as old links into `missed`. Left out of the summary (not on the board): the response score, the reading tiles and "Waggle only checked <platform>".
