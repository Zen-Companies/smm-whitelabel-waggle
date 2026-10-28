# PRD: AI Receptionist MVP (Pass 1)

Status: Draft v1 · Owner: Feb · Last updated: 2026-10-28

## 1. Summary

A multi-tenant web app for local businesses. The owner connects Instagram and Facebook, publishes and schedules posts, and an AI receptionist handles incoming comments and DMs: Jev sorts each message, an LLM drafts a reply from the business's own knowledge base, and the owner approves (or lets safe categories auto-send). Zernio is the social layer for publishing, inbox and replies.

## 2. Problem

Local businesses get questions, booking requests and complaints in comments and DMs. Replies are slow or missed, customers go elsewhere, and most owners can't afford a social media person.

## 3. Users

- **Owner / manager (primary):** non-technical and busy. Connects accounts, fills in business info, approves replies, receives leads and alerts.
- **End customer:** comments on a post or sends a DM and expects a fast, accurate answer.

One owner per tenant in Pass 1 (team members later).

## 4. Goals

1. Every comment and DM gets a fast, accurate first reply.
2. Nothing risky goes out without the owner's approval.
3. Leads are captured and handed to the owner.
4. The owner can publish and schedule posts from the same app.
5. AI cost per message is tracked from day one.

## 5. Scope of Pass 1

| #   | Feature                    | Summary                                                           |
| --- | -------------------------- | ----------------------------------------------------------------- |
| F1  | Signup and tenant setup    | Supabase Auth signup creates a tenant and its Zernio profile      |
| F2  | Connect accounts           | Connect Instagram and Facebook via Zernio; handle disconnects     |
| F3  | Publish and schedule posts | Compose text + image, publish now or schedule, see status         |
| F4  | Inbox ingestion            | Receive comments and DMs via Zernio webhooks                      |
| F5  | Triage                     | Jev classifies each message (LLM fallback)                        |
| F6  | Knowledge base             | Owner enters FAQ, hours, prices, services; stored with embeddings |
| F7  | Reply drafting             | LLM drafts replies grounded only in the knowledge base            |
| F8  | Approval inbox             | Approve, edit or reject drafts; updates live                      |
| F9  | Autonomy settings          | Per category: off / approve first / auto-send                     |
| F10 | Sending                    | Reply to comments and DMs through Zernio, safely                  |
| F11 | Escalation and alerts      | Complaints and unclear messages go to the owner by email          |
| F12 | Lead capture               | Extract and list leads with their conversation                    |
| F13 | Billing                    | Stripe subscription; features gated when unpaid                   |
| F14 | Audit and usage            | Log every decision, draft, edit and send; track AI cost           |

## 6. Features and acceptance criteria

### F1. Signup and tenant setup

- Owner signs up with email (Supabase Auth); a tenant is created with the owner as member.
- A Zernio profile is created with `externalId = tenant.id`; a retry never creates a second profile.
- **Done when:** a new signup has exactly one tenant row and one Zernio profile linked to it.

### F2. Connect accounts

- Owner clicks "Connect Instagram" or "Connect Facebook" and completes Zernio's connect flow.
- Connected accounts appear in settings with platform, username and health status.
- On `account.disconnected`, processing for that account pauses and the owner gets an email with a reconnect link.
- **Done when:** an owner can connect, see, and reconnect an account; a disconnect pauses its items and alerts the owner.

### F3. Publish and schedule posts

- Compose text with an optional image; choose target accounts; publish now or pick a date and time.
- Post status (scheduled, published, partial, failed) updates from Zernio post webhooks.
- Failed posts show the error and can be retried.
- **Done when:** a post can be published immediately and scheduled, and its final status shows correctly in the app.

### F4. Inbox ingestion

- New comments and DMs arrive via webhook and appear in the app within seconds.
- Duplicate webhook deliveries never create duplicate items.
- **Done when:** a test comment and a test DM each create exactly one inbox item, even if the webhook is delivered twice.

### F5. Triage

- Each item is classified as `faq`, `lead`, `complaint`, `spam` or `unclear`, with a confidence score.
- Below the confidence threshold, the item is treated as `unclear`.
- If Jev errors or times out, an LLM classifier is used and the fallback is recorded.
- **Done when:** every item gets exactly one category, and a forced Jev failure still classifies via fallback.

### F6. Knowledge base

- Owner can add, edit and delete entries (FAQ, hours, prices, services, policies).
- Entries are embedded and searchable for drafting.
- **Done when:** editing an entry changes what drafts say about that topic.

### F7. Reply drafting

- `faq` and `lead` items get an LLM draft using only retrieved knowledge base entries.
- The draft never invents prices, availability, discounts or promises; if the answer isn't in the knowledge base, it says the business will follow up and flags the item.
- Lead drafts also extract name, contact and request when present.
- **Done when:** drafts answer covered questions correctly and flag uncovered ones instead of guessing.

### F8. Approval inbox

- Lists items awaiting approval with the original message, the draft and the category.
- Approve sends as is; edit then approve sends the edited version; reject closes it without sending.
- New drafts appear without a page refresh (Supabase Realtime).
- **Done when:** an owner can approve, edit and reject, and a new draft appears live.

### F9. Autonomy settings

- Per category: `off` (no AI reply), `approve` (draft waits for owner), `auto` (sends automatically if the policy check passes).
- Defaults: faq = approve, lead = approve, complaint = off, spam = off, unclear = off.
- **Done when:** changing a category's mode changes what happens to the next item in that category.

### F10. Sending

- Comment replies and DM replies go out through Zernio.
- DM replies outside Meta's 24-hour window are not sent; the item is escalated instead.
- Each send uses an idempotency key so retries never double-send.
- **Done when:** approved replies appear on Instagram/Facebook exactly once, and an expired DM window escalates instead of sending.

### F11. Escalation and alerts

- Complaints, unclear items, uncovered questions and failed sends notify the owner by email (Resend).
- **Done when:** an escalated item triggers one email with a link to the item.

### F12. Lead capture

- Leads are saved with name, contact, request and a link to the conversation; the owner is emailed.
- **Done when:** a lead message creates a lead row and an email.

### F13. Billing

- Owner subscribes via Stripe Checkout; subscription status syncs via Stripe webhooks.
- When unpaid, inbound items are still stored but no AI processing or sending happens, and the app shows a billing banner.
- **Done when:** an active subscription enables processing and a cancelled one pauses it.

### F14. Audit and usage

- Every classification, draft, edit, approval, rejection and send is logged with actor and timestamp.
- Every AI call records provider, model, tokens and estimated cost per tenant.
- **Done when:** any reply that went out can be traced to its draft, decision and AI calls.

## 7. Non-functional requirements

- **Reliability:** no message lost; processing is idempotent; failed steps retry, then escalate.
- **Speed:** draft ready within about a minute of receipt (cron interval).
- **Security:** tenant isolation via RLS; all webhooks signature-verified; secrets only in server env.
- **Privacy:** customer messages kept only as long as needed; Zernio DPA in place.
- **Cost:** AI cost tracked per message and per tenant.

## 8. Success metrics (pilot)

- Median time to first reply drops sharply vs before the pilot.
- Most drafts approved without edits.
- Leads captured per business per week.
- Zero brand incidents (replies the owner had to delete).
- At least 2 of 3 pilot businesses keep paying after the trial.

## 9. Out of scope for Pass 1

AI content generation (UGC), generative dashboard, ads, analytics dashboards, TikTok/LinkedIn, WhatsApp/SMS/voice, team members and roles, weekly summary email, Temporal (background jobs run on Supabase), model routing/OpenRouter.

## 10. Open questions

- Jev pricing and API details (early access).
- Confidence threshold for auto-send (start at 0.85, tune in pilot).
- Pilot business type.
- Pricing tiers for Stripe (placeholder plan for pilot).
