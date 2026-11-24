# Promotions in the app (plan, 24 Nov)

Status: **design proposal, waiting for approval.** Nothing below is built yet beyond what Jason's PR #58 already has.
Board: https://claude.ai/artifact/TW1tjpznow8TY81YnoK8dN#artboard-RPromoUI ("Review now" page of the Waggle screens v3 canvas).

## Context

- **Jason's PR #58** (branch `jason-black-friday`, staging merged in, local only in `waggle-billing`):
  - Black Friday: a 30-day trial on the organization's first plan checkout instead of 7 days (`src/features/billing/promo.ts`, `BLACK_FRIDAY`).
  - Give a month, get a month: a referral link per organization (`/signup?ref=<code>`), the friend gets the free month, the referrer earns a month off after the friend's first payment (`referral-card.tsx`, `referrals.ts`, `ref-catcher.tsx`).
  - Today's copy is plain: one honey line on Your plan ("Black Friday: your first month is free. Choose a plan by Monday, 30 November."), one line on sign-up ("A friend sent you here: your first month on a paid plan is free."), and one line after checkout ("You're on Solo. Free until December 24.").
- **Walter's website promo** (gowaggle `origin/waggle-replica`, `src/app/(site)/_components/bfcm-promo.tsx`, `nav.tsx`, `_lib/season.ts`, `site.css`): a black top strip (honey day name, "Refer a friend. You both get a month free →"), a black notched "pass" hero badge (outlined BLACK/FRIDAY, light sweep, honey +1), a gold-edged pass in Pricing, and a closing line. Switches to Cyber Monday on Mon 30 Nov.

## Decisions (Febron, 24 Nov)

1. End date: Jason's, **Mon 30 Nov 11:59 pm ET** (`BLACK_FRIDAY.endsAt`).
2. The referrer's month comes **after the friend's first payment** (Jason's rule).
3. `?ref=` carries from the website into the app's sign-up.

## The four improvements (pending approval)

1. **Top bar (app-wide).** A moving announcement bar above the app navbar, styled like Walter's strip (black pass, honey, cream). Slowly scrolling text; "Choose a plan →" opens the plan pop-up in place (or /plan). Only for Owners of never-paid organizations while the promo runs. × hides it for the day. Reduced motion: still, one line. Phone layout with shorter lines. Cyber Monday text on 30 Nov.
2. **Your plan headline.** Replace the plain Black Friday line with Walter's pass adapted to the app: outlined day name, "Your first month is free.", the end date and an "Ends in N days" chip, +30 days, Choose a plan. Variants: last day ("Ends tonight"), referral month after Black Friday, phone.
3. **Invite card on sign-up.** For a friend's link: bee on a honeycomb, "Invited by <referrer's business name>" (else "A friend"), "Your first month on any paid plan is free", "Applied automatically at checkout". The dark left panel speaks to invited visitors. States: name unknown, program ended, bad code (no card), phone. Only the business name shows (privacy); the referral card should say so.
4. **Success modal after checkout.** Bee dance + honeycomb burst (reduced motion: still), "You're on Solo", "Free until 24 Dec, nothing to pay until then", 3 unlocked ticks from the plan, the friend's month line when it applied (or the referrer's banked months), one primary button carrying on the tapped action (Connect TikTok / Invite your team / Add your business) plus Go to my Inbox. States: checking with Stripe, not confirmed (as today), Team, phone bottom sheet.

## Later goal: promotions become dynamic (admin-editable)

UI first, reading today's constants in `promo.ts`. Then move promotions to the backend so our team can edit them without a deploy: text lines, start and end dates, day name, colours on/off, countdown on/off, link target, and who sees each surface (e.g. never-paid Owners). The board marks those fields with a dashed honey "admin-editable" tag.

## Open questions

- Should the top bar also show the referral offer to paid Owners after Black Friday ends?
- × for the day vs for the whole promo.

## Decisions (user, 24 Nov, on the open questions)
- Top bar audience is NOT fixed: each promotion (Black Friday, a future seasonal promo, the referral program) has its own bar settings in admin — on/off, who sees it (e.g. never-paid Owners only / all Owners incl. paid / everyone), dates, text. Referral bar is separate from seasonal promos so it can run on its own.
- The × on the top bar hides it for the rest of that day (per viewer), then it can show again.
- APPROVED (user, 24 Nov): board RPromoUI (Review now). Build the 4 changes now on branch jason-black-friday; UI first, reading from one typed promotions config (code constants for now, shaped for the later admin/DB version).

## Build note (24 Nov, branch jason-black-friday, local only, not committed)

- **One config:** `src/features/billing/promotions.ts`, a typed list shaped like the future admin/DB records (`id`, `kind` seasonal|referral, `enabled`, `startsAt`/`endsAt`, `trialDays`, `countdown`, `bar` {enabled, audience never_paid_owners|owners|everyone, own dates, label, lines, phone lines, CTA, link}, `pass` copy, `lastDay` face for Cyber Monday) plus `REFERRAL_COPY`. Pure helpers with tests (`promotions.test.ts`): active bar for a viewer/time, audience, days left in US Eastern ("Ends in N days" / "Ends tomorrow" / "Ends tonight"), the ×-for-today cookie, the pass, the invite state, success lines. `promo.ts` keeps its behaviour and now reads its dates/days from the list.
- **1 Top bar:** `PromoBar` (server) + `promo-bar-view.tsx`, above the navbar in the dashboard and setup layouts. Drifts (computer and shorter phone lines), tap opens the plan pop-up in place (`?upgrade=nudge`), × sets a cookie `<promotion>.<viewer's day>` read on the server, so no flash. Reduced motion: still, one line cut with …. Black Friday bar: never-paid Owners until 30 Nov 11:59 pm ET; Cyber Monday text on 30 Nov. The referral program's bar exists in the config but is **off** (enable + pick audience when wanted).
- **2 Your plan:** `PromoPass` replaces the plain line (Walter's notched pass, outlined day name, light sweep, +30 days, chip, Choose a plan → pop-up). Last day and friend's-month faces; stacked on phones.
- **3 Sign-up:** `InviteCard` + `InvitePanel` (over the left wall on computers). Name = the referring organization's **first business (brand) name**, not the organization name (that starts as a person's, "Febron's Organization"); else "A friend". Ended program: honest card. Unknown code: no card. Referral card now says "Your link shows your business name, nothing else."
- **4 Success:** `checkout-success.tsx` in the upgrade pop-up: burst + bee dance (reduced motion: still bee on 3 filled combs), "You're on Solo", "Free until 24 Dec" from Stripe's `trial_end`, price line, the pop-up's ticks, friend's/banked month lines from the checkout's own metadata, one primary (carry-on or Go to my Inbox). Checking with Stripe and not-confirmed states kept.
- User (24 Nov): build the admin side now (no separate canvas board; follow the Staff → Plans page pattern). Promotions stored in DB, edited in Staff, app reads DB with code defaults as fallback.

## Build note: admin side (24 Nov, branch jason-black-friday, local only, not committed)

- **Table** (migration `20261124160000_promotions.sql`): `promotions` (one row per promotion: slug id, name, kind, on/off, starts/ends, trial days 1–90, countdown, reward months for the referral program, bar on/off + audience `never_paid_owners|all_owners|everyone` + label/lines/phone lines/link texts/link, pass day name/headline/small line, optional last-day face) and `promotion_changes` (who, when, action, before/after). Server-only like `plan_settings`: RLS on, no policies, AI assistants' tokens refused; in the pgTAP exempt list, plus `supabase/tests/database/promotions.test.sql`. Seeded with today's code values (checked equal to `promotions.ts`). Bar lines: one per line, honey tail in `*stars*`.
- **Loader** (`promotions-store.ts`): reads the table with the service role, 30-second cache per server instance + once per request; the code list in `promotions.ts` is the fallback when the table is empty or unreachable. A save clears the cache. The bar, the Your plan pass, the sign-up invite card, the checkout trial days, the pop-up/offer trial days and the referrer's reward all read it; the pure helpers take the list as an argument. The audience value `owners` is now `all_owners`.
- **Staff → Promotions** (`/admin/promotions`, next to Plans, `admin.caps.manage` like Plans): list with Running / Scheduled / Ended / Off and an on/off switch, New promotion (seasonal or referral, created off), edit page `/admin/promotions/<id>` with every field, dates typed in US Eastern with ET + UTC shown under each, live preview of the bar (computer and phone, before and last day) and the Your plan pass, and the change history. Feedback in place, no toasts.
- **Simplified:** global promotions have no brand, so no `audit_log` row (it needs a tenant): `promotion_changes` is the audit trail, as `plan_settings_changes` is for Plans. The sign-up/success wording (`REFERRAL_COPY`) stays in code. A bar uses its promotion's dates (no separate bar dates). The last-day face reuses the main link texts. Other server instances see a change within 30 seconds.

## Walter's GHL referral campaign (24 Nov) — added to this branch
Ask (Walter via user): GHL sends campaign emails Fri 27, Mon 30, Tue 1 Dec; offer "give a month, get a month of Solo", runs through Dec 1.
Decisions (user, 24 Nov):
- End date: Tue 1 Dec 11:59 pm ET (2026-12-02T04:59:59Z) for Black Friday AND the referral bar/campaign (seed + code defaults; editable in Staff → Promotions).
- referral_rewarded timing: each person when their own month is applied in Stripe — friend at their checkout (30-day trial starts), referrer when the balance credit lands after the friend's first payment.
To build:
1. A referral page in the app at /refer (owner copies their link; same content as the Your plan referral card, full page). Tell Walter the path for the email buttons.
2. signed_up CRM event keeps/sends ref_code + referred_by (check src/lib/crm/catalog.ts + orgs/server.ts; add if missing).
3. New CRM event referral_rewarded, once per person: upsert contact fields waggle_event=referral_rewarded, waggle_referral_role=referrer|friend, waggle_referral_with=<other person's business name>, waggle_referral_ends=<their free month end, readable e.g. "December 30">, waggle_plan=solo (the plan), waggle_event_at=ISO; then add tag waggle-app-event. Same path as other events (plain field keys, see memory ghl-sync). Referrer and friend events for the same referral ≥30 s apart (job queue delay). Dedupe so each fires once.
4. Upgrade pop-up: Walter said "kay nawala ang logo" (the logo disappeared) — compare our pop-up with his spec https://claude.ai/artifact/LiwT4mxqxALZ5VGUYYZCq4 and restore the missing logo(s) (likely platform logos in the picture strip and/or the Waggle/bee logo at the top).
Testing: GHL contacts febron+anything@zencompaniesinc.com; tell Walter before a referrer test (it emails Walter, Jason, Febron).

## Build note (24 Nov, branch promotions, PR #63) — Walter's GHL referral campaign
- **/refer** (`src/app/(dashboard)/refer/page.tsx`): Owners get the same referral card as Your plan, full page, plus "Your plan →". Others see that only the Owner has the link. Path for Walter's email buttons: `https://<app>/refer`.
- **signed_up** now also sends `ref_code` (the friend's link code) and `referred_by` (the referrer's business name) when the sign-up came through a friend's link, read at send time (`sender.ts`, `signupReferral`). These are new plain-key fields Walter needs on the sub-account (`ref_code` already existed for UTMs; `referred_by` is new).
- **referral_rewarded** (`src/lib/crm/referral.ts` pure + `features/billing/referrals.ts`): friend when their first plan's trial starts with the friend's/Black Friday month (Stripe webhook, `trial_started`); referrer when the balance credit lands (jobs route) or banked months start their first trial. Fields `waggle_referral_role`, `waggle_referral_with`, `waggle_referral_ends` ("December 30", US Eastern), `waggle_plan` (the plan's shown name), then `waggle-app-event`. Dedupe `referral_rewarded:<referral>:<role>:<user>`; the other side is ≥30 s apart (`next_attempt_at` at queue time + a sender guard). The three fields are blank on other events. Walter must create the three `waggle_referral_*` fields (and `referred_by`) in HighLevel.
- **Upgrade pop-up**: the strip boxes have their pictures back, as in Walter's spec: the platform's real logo (connected / adding / picked / reconnect), the bee on Worker Bee, else a plain ✓ or +.
- **Dates**: Black Friday and the referral offer end Tue 1 Dec 11:59 pm ET (2026-12-02T04:59:59Z) in `promotions.ts` and via migration `20261124200000_promotions_end_dec_1.sql` (only where the seeded end is still there; logged in promotion_changes). The bar/pass copy says Tue 1 Dec; the last-day face moved to Tue 1 Dec 00:00 ET and is labelled "Last day" (was Cyber Monday on Mon 30 Nov, which would have said "Ends tonight" a day early).

## Review fixes (24 Nov, branch promotions-fixes, PR into staging)
- **Referrer's credit never twice:** the jobs route claims a row (`crediting`, claim time in `rewarded_at`) before calling Stripe, looks for a balance transaction with `metadata.referral_id` before making one, and checks every write; a failure hands the row back to `reward_due`, a claim older than 10 minutes is retried. New statuses `crediting` and `no_reward` (migration `20261125000000_referrals_crediting.sql`).
- **Banked months of a referrer with a plan again** (one it had before, so no trial to put them in): the jobs route credits them to the Stripe balance, unless the subscription's `banked_referrals` shows a first checkout's trial used them.
- **The running referral program everywhere** (`runningReferral`): the friend's month, the pass, the invite card and the referrer's reward read the program that ran **when the friend signed up** (the referral row's `created_at`), so a friend who joined during the offer keeps the month after it ends, and the referrer is still credited after it ends.
- A promotion never shortens the trial (`max(usual, promotion)`); a banked month is the referral program's trial days × reward months.
- **Founding coupon and long trials:** Stripe counts a repeating coupon's months from when it's applied, trial included (docs.stripe.com/billing/subscriptions/coupons, "Coupon duration"). A checkout with a trial of 28+ days gets a copy `waggle_founding_business_<n>m` lasting 6 + ⌊trial days / 28⌋ months, made from the base coupon on first need; the 50 spots count every copy.
- Referral card: hidden on Your plan while the program isn't running; /refer says it isn't running; a load error never breaks the page.
- Staff → Promotions: the edit form no longer carries on/off (the switch owns it); the history compares dates as instants.
- Audit rows for `referral.reward_due` and `referral.banked_used`.
