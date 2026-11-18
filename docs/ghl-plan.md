# GoHighLevel API in Waggle — build plan (18 Nov)

> **Built, and updated to Walter's API path (18 Nov):** the app sends every contact field plus the one
> trigger tag `waggle-app-event`; HighLevel's workflow applies the `waggle-*` tags. The tables below are
> what that workflow does. How the code works: `src/features/crm/README.md`.

Decision: the app talks to HighLevel's API directly (Private Integration Token, Waggle sub-account
`k0lV8H3WuN9F6Yz0yl6I`). For each event it updates the owner's contact (custom fields) and adds/removes the
`waggle-*` tags from Walter's tag page. HighLevel workflows start on "tag added" and read the fields.
Walter's inbound webhook stays only for beta_joined / feedback / page_rating.

## API calls (checked with HighLevel's API, 18 Nov)
- `POST /contacts/upsert` — body `locationId`, `email`, `name`, `customFields: [{ id | key, fieldValue }]`.
  Matches by email (the sub-account's duplicate setting). Don't send `tags` here: it overwrites all tags.
- `POST /contacts/{id}/tags` — `{ tags: [...] }` (add).
- `DELETE /contacts/{id}/tags` — `{ tags: [...] }` (remove).
- Base `https://services.leadconnectorhq.com`, `Authorization: Bearer <PIT>`, `Version: 2021-07-28`.
- Limits 100 / 10 s and 200,000 / day per location; 429 without Retry-After (wait on X-RateLimit headers).
- Token scopes: contacts.write, contacts.readonly, locations/customFields.readonly.

## Contact fields: Walter's, already in the sub-account (created 18 Nov)
| Field key | What the app sends |
|---|---|
| contact.waggle_event | the event name (trial_started, trial_converted, …) |
| contact.waggle_event_at | when it happened (ISO date-time) |
| contact.waggle_plan | solo / team / business (team = $99 = our id `business`; business = $199 = our id `team`) |
| contact.waggle_from_plan | plan_changed: the plan before |
| contact.waggle_founding | yes / no |
| contact.waggle_trial_ends | trial end date |
| contact.waggle_ends_on | when access ends (canceled / trial expired) |
| contact.waggle_platform | account_connected: the platform |
| contact.waggle_accounts_connected | count |
| contact.waggle_days_inactive | inactive: days since last visit |
| contact.waggle_replies_used | usage_80 / usage_100: replies used |
| contact.waggle_reply_limit | the month's allowance |
| contact.waggle_resets_on | when replies reset |
| contact.waggle_business | business name (exists from the waitlist) |
Proposed extras (only if wanted): waggle_status (trialing/active/past_due/canceled), waggle_renews, waggle_user_id.

## Event → tags (Walter's table, applied by the app)
| Event | Add | Remove | Source in the app |
|---|---|---|---|
| trial_started | waggle-user, waggle-trial, waggle-plan-<plan> | | Stripe checkout completed with a trial |
| account_connected | waggle-account-connected | | first account connected |
| business_info_saved | waggle-info-saved | | business profile saved the first time |
| trial_converted | waggle-paid (+ waggle-founding-rate if founding) | | first paid invoice after the trial |
| plan_changed | waggle-plan-<new> | waggle-plan-<old> | subscription plan changed |
| payment_failed | waggle-payment-failed | | invoice.payment_failed (**add this Stripe event**) |
| payment_recovered | | waggle-payment-failed | invoice paid after a failure |
| canceled after paying | waggle-canceled, waggle-paid-canceled | | subscription ended, had paid |
| canceled in trial | waggle-canceled, waggle-trial-canceled | | canceled before the first payment |
| trial_expired | waggle-trial-expired | | trial ended without paying |
| inactive, app_active, usage_80, usage_100, account_limit, founding_full | — | | fields only (waggle_event changes, so a workflow can trigger on it) |
Open: with no tag, how do Walter's workflows start for those six? Field-changed trigger on waggle_event, or a tag per event?

## How it's built
- Outbox table (server-only, RLS); writers never call HighLevel (Stripe webhook only stores, rule 3).
- Jobs route sends oldest first, one person at a time (trial_converted before canceled); retries with backoff.
- `lib/ghl` client, mocked in tests (rule 14); pure tested pieces: event → tags/fields, plan names.
- Last-active tracking (once an hour per login) and a daily sweep for inactive / usage.
- Staff → Switches: HighLevel sync on/off.

## Needed
- Private Integration Token on the Waggle sub-account → `GHL_PRIVATE_TOKEN` (Vercel Production + .env.local); `GHL_LOCATION_ID=k0lV8H3WuN9F6Yz0yl6I`.
- Stripe live and test webhooks: add `invoice.payment_failed`.
- Walter: remove tag steps from the Inbound Users webhook workflow; answer the "no tag" question.
