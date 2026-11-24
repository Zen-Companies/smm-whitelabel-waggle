# Waggle → GoHighLevel (CRM sync)

Waggle tells HighLevel what each **owner** is doing (trial started, paid, canceled, inactive…) so
HighLevel's workflows can send the right emails. The contract is Walter's "Waggle GHL Tags" page
(API path, tested 18 Nov) and `docs/ghl-plan.md`.

## How it works

1. Something happens in the app → one row in the `crm_events` queue (`queueForOwners` /
   `queueCrmEvent` in `src/lib/crm/queue.ts`). Queueing only writes to the database, so it's safe
   anywhere, including the Stripe webhook. A dedupe key makes repeats harmless.
2. Every minute the jobs route calls `deliverCrmEvents` (`sender.ts`): oldest event first per
   person, at least 30 s after their previous one.
3. For each event: `POST /contacts/upsert` with **every** field (`fields.ts`), then add the tag
   `waggle-app-event`. HighLevel's workflow reads `waggle_event`, applies the `waggle-*` tags and
   clears the trigger tag. **The app never adds the `waggle-*` tags itself.**
4. Failures retry with backoff (6 tries); a 429 waits on HighLevel's rate-limit headers.

## Where to change things

| To change…                             | Edit                                                                |
| -------------------------------------- | ------------------------------------------------------------------- |
| The list of events                     | `src/lib/crm/catalog.ts` (`CRM_EVENTS`)                             |
| Which fields are sent, or their values | `src/lib/crm/catalog.ts` (`CRM_FIELDS`) + `fields.ts` (`crmFields`) |
| Which Stripe changes mean which event  | `src/lib/crm/lifecycle.ts` (pure, tested)                           |
| Where an app event is queued           | search for `queueForOwners(` / `queueCrmEvent(`                     |
| The facts a contact is built from      | `snapshot.ts`                                                       |
| The HighLevel calls themselves         | `src/lib/ghl/client.ts`                                             |
| Days before "inactive" / the 30 s gap  | `src/lib/crm/catalog.ts`                                            |

## Events and where they start

| Event                                                                                                    | Queued from                                                                             |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| trial_started, trial_converted, plan_changed, payment_failed, payment_recovered, canceled, trial_expired | `features/billing/billing-store.ts` (Stripe subscription events, via `lifecycleEvents`) |
| account_connected                                                                                        | `features/accounts/events.ts` (the organization's first account)                        |
| first_reply_approved                                                                                     | `features/approvals/decisions.ts` (the organization's first approved draft, once)       |
| business_info_saved                                                                                      | `features/tenants/actions.ts` (first save of a business profile)                        |
| usage_80, usage_100                                                                                      | `features/billing` reply limit (once per month each)                                    |
| account_limit                                                                                            | `features/accounts` connect actions (once a day)                                        |
| inactive, app_active                                                                                     | `activity.ts` (sweep in the jobs route; a visit)                                        |

## Failed connects (Fix 1, 24 Nov)

`connect_failed` is queued for the person who tried (`features/accounts/connect-trace-store.ts`) when a
connect comes back with an error, comes back with no account, or has no return after 2 hours (the jobs
route's 15-minute sweep). At most once per brand + platform per 6 hours. Besides every usual field
(`waggle_platform` too) it sends four more, which must exist in HighLevel:

| Field                     | Value                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| `waggle_connect_platform` | the platform id (`instagram`, `facebook`, …)                                 |
| `waggle_connect_error`    | Zernio's `error` code, or `no_account` / `abandoned`                         |
| `waggle_connect_fixable`  | `yes` / `no` / `unknown` (Zernio's `is_user_fixable`)                        |
| `waggle_connect_in_app`   | `yes` / `no`: started inside Instagram's, Facebook's or TikTok's own browser |

Every attempt, with all of Zernio's error fields, is kept in `connect_attempts`.

## Sign-up, feedback and first-touch UTM (18 Nov)

| Event       | What HighLevel gets                                                                                                                                                                                                                                                                 | Queued from                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| signed_up   | Like every event: the fields (`waggle_event = signed_up`, plan `free` since 19 Nov, founding false) + first-touch UTMs, then `waggle-app-event` and `waggle-signup`. Since the Free plan (19 Nov) there is no trial: moving up to a paid plan pays at checkout (`trial_converted`). | `features/orgs/server.ts` (a login's personal organization, logins under 2 days old) |
| feedback    | A note on the contact ("Waggle feedback · type": message, follow-up, OK to contact, page, business, role). No tag.                                                                                                                                                                  | `features/feedback/actions.ts`                                                       |
| page_rating | A note ("Page rating · page: good / not good" + the reason). No tag.                                                                                                                                                                                                                | `features/feedback/actions.ts`                                                       |

- **UTMs:** the proxy keeps the first link's `utm_source / utm_medium / utm_campaign / utm_content / ref` in the
  `waggle_utm` cookie (90 days, first one wins). At sign-up they go to the contact's `utm_*` / `ref_code` fields,
  **only when the contact has none yet** (the gowaggle.ai waitlist may have set them first). See `src/lib/crm/utm.ts`.
- The old inbound webhook (`src/lib/ghl.ts`) still sends beta_joined / feedback / page_rating until it's retired.

## Give a month, get a month (Walter's GHL referral campaign, 24 Nov)

| Event / field     | What HighLevel gets                                                                                                                                                                                                                                                                             | Queued from                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| signed_up         | Also `ref_code` (the friend's link code) and `referred_by` (the referrer's business name) when they came through a friend's link, read at send time.                                                                                                                                            | `sender.ts` (`signupReferral`)                                                                                                                                                       |
| referral_rewarded | Once per person per referral: `waggle_referral_role` (referrer / friend), `waggle_referral_with` (the other side's business name), `waggle_referral_ends` (their free month's end, "December 30", US Eastern), `waggle_plan`, then `waggle-app-event`. Referrer and friend at least 30 s apart. | `features/billing/referrals.ts`: the friend when their first trial starts (Stripe webhook); the referrer when the credit lands (jobs route) or banked months start their first trial |

The pure rules (readable date, dedupe key, 30 s gap, friend's month applied) are in `src/lib/crm/referral.ts`.

## Rules (Walter's)

- Plan words are `free` (no paid plan, 19 Nov), `solo`, `team` ($99), `business` (by call). Waggle's **ids are swapped** for the two
  upper plans, so `crmPlan()` uses the plan's name, never its id.
- Every field on every event; `waggle_founding` is always `false` (founding offer retired, 24 Nov).
- `trial_converted` always before a later `canceled` (the queue keeps order per person).
- Only the owner's own account data. Never their customers' names, messages or contacts.

## Setup

`GHL_PRIVATE_TOKEN` (a Private Integration Token on the Waggle sub-account; scopes contacts.write,
contacts.readonly) and `GHL_LOCATION_ID` (`k0lV8H3WuN9F6Yz0yl6I`). Without them nothing is sent and
the queue waits, so local and staging are safe by default. Tests never call HighLevel.

## Referral link, trial end and the checkout link (Walter, 25 Nov)

| Field / link           | What HighLevel gets                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waggle_referral_link` | The Owner's own link, `https://app.gowaggle.ai/signup?ref=<code>`, on every event about an Owner (the code is made if missing; never for teammates). Also `referral_link`, a fields-only event (no tag, no workflow), once per code per Owner when the code is made or first shown (`ensureReferralCode`). |
| `waggle_trial_ends`    | The trial's end as "December 24" (US Eastern), on every event (was `2026-12-24` before 25 Nov).                                                                                                                                                                                                            |
| `waggle_trial_ends_at` | The trial's end, ISO (`2026-12-24T15:00:00.000Z`), on every event.                                                                                                                                                                                                                                         |
| Checkout link          | `https://app.gowaggle.ai/plan?start=solo` (or `start=team`): an Owner on Free goes straight to Stripe Checkout (first month free, card). Signed out: sign in, then back to the link. Teammates see a note to ask the Owner. Never Business. `src/lib/checkout-link.ts`.                                    |
