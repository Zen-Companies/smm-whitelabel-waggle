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
| business_info_saved                                                                                      | `features/tenants/actions.ts` (first save of a business profile)                        |
| usage_80, usage_100                                                                                      | `features/billing` reply limit (once per month each)                                    |
| account_limit                                                                                            | `features/accounts` connect actions (once a day)                                        |
| founding_full                                                                                            | `sender.ts`, after a founding trial takes the last spot                                 |
| inactive, app_active                                                                                     | `activity.ts` (sweep in the jobs route; a visit)                                        |

## Sign-up, feedback and first-touch UTM (18 Nov)

| Event       | What HighLevel gets                                                                                                | Queued from                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| signed_up   | The contact (name, email, first-touch UTMs) + the tag `waggle-signup`. No note, no fields, no trigger.             | `features/orgs/server.ts` (a login's personal organization, logins under 2 days old) |
| feedback    | A note on the contact ("Waggle feedback · type": message, follow-up, OK to contact, page, business, role). No tag. | `features/feedback/actions.ts`                                                       |
| page_rating | A note ("Page rating · page: good / not good" + the reason). No tag.                                               | `features/feedback/actions.ts`                                                       |

- **UTMs:** the proxy keeps the first link's `utm_source / utm_medium / utm_campaign / utm_content / ref` in the
  `waggle_utm` cookie (90 days, first one wins). At sign-up they go to the contact's `utm_*` / `ref_code` fields,
  **only when the contact has none yet** (the gowaggle.ai waitlist may have set them first). See `src/lib/crm/utm.ts`.
- The old inbound webhook (`src/lib/ghl.ts`) still sends beta_joined / feedback / page_rating until it's retired.

## Rules (Walter's)

- Plan words are `solo`, `team` ($99), `business` ($199). Waggle's **ids are swapped** for the two
  upper plans, so `crmPlan()` uses the plan's name, never its id.
- Every field on every event; `waggle_founding` is always `true` or `false`.
- `trial_converted` always before a later `canceled` (the queue keeps order per person).
- Only the owner's own account data. Never their customers' names, messages or contacts.

## Setup

`GHL_PRIVATE_TOKEN` (a Private Integration Token on the Waggle sub-account; scopes contacts.write,
contacts.readonly) and `GHL_LOCATION_ID` (`k0lV8H3WuN9F6Yz0yl6I`). Without them nothing is sent and
the queue waits, so local and staging are safe by default. Tests never call HighLevel.
