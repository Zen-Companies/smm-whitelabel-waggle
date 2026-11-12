# Platforms beyond Instagram and Facebook: what Zernio supports

Researched 2026-11-09 from docs.zernio.com (read only, no API calls). Main source:
https://docs.zernio.com/platforms/compare, checked against each platform's pages. Spot-checked:
Snapchat blocked (/platforms/snapchat) and per-account pricing (/pricing/social).

## Capability table

| Platform | Connect | Post | Comments (read / reply / arrival) | DMs (read / send / arrival) | Reviews | Hide / private reply | Analytics |
|---|---|---|---|---|---|---|---|
| Instagram | OAuth | yes | yes / yes / real-time | yes / yes / real-time | no | yes / yes | yes |
| Facebook | OAuth + Page pick | yes | yes / yes / real-time | yes / yes / real-time | list + reply, polling only | yes / yes | yes |
| TikTok | OAuth (Business app) | media required | yes / yes / real-time | yes / replies only / real-time; not in EEA, UK, CH | no | hide / no | limited |
| YouTube | OAuth, 1 channel per profile | video only | yes / yes / polled | no | no | moderate, delete / no | yes |
| X | OAuth, card required | yes | yes / yes / unconfirmed | yes / yes / paid polling, opt-in | no | hide / no | yes, paid per call |
| Threads | OAuth | yes | yes / yes / real-time | no | no | hide / no | yes |
| Pinterest | OAuth + board pick | yes, needs a board | no | no | no | no | yes |
| Bluesky | app password | yes | yes / yes / polled | text only / yes / yes | no | no | limited |
| LinkedIn | OAuth + person or company | yes | company pages only / yes / polled | no | no | no | yes |
| Snapchat | blocked: Snap hasn't approved Zernio's app (403 for everyone) | n/a | no | no | no | no | n/a |
| Google Business | OAuth + location pick | yes, 1 image max | no | no | list + reply + webhooks | n/a | location only |
| WhatsApp | Meta Embedded Signup | templates/broadcasts | no | yes / yes / real-time; 24h window + templates | no | n/a | no |
| Telegram | Zernio's shared bot as admin | yes (channel/group) | no | group/channel only, private DMs not stored | no | n/a | no |
| Discord | bot + one channel | yes | no | send only, nothing inbound | no | n/a | no |

## Key notes per platform

- **TikTok:** every post needs video or photos and two consent flags; daily post caps. Inbox needs
  the Business app connection. DMs: Business Account outside EEA/UK/CH, reply only, max 10
  messages in 48 h after the customer's last message, text or one image.
- **YouTube:** video only; comments polled (interval undocumented); 10,000 quota units a day.
- **X:** card required; every API call passed through at X's rate (DM read $0.010, DM send
  $0.015, post $0.015, post with a link $0.200). DM polling and analytics are opt-in per account.
  Comment delivery is contradictory in the docs.
- **Threads:** comments only (reply, delete, hide), real-time. Fits the existing comment pipeline.
- **LinkedIn:** comments only on company pages, polled; no DMs; duplicate posts rejected (422).
- **Bluesky:** owner creates an app password; DMs text only; comments polled.
- **Google Business:** verified location needed; one account = one location. Review webhooks
  (`review.new/updated`, opt-in `deleted/restored`). One owner reply per review: a second reply
  overwrites it (send an Idempotency-Key). Review replies don't count toward the message meter.
- **WhatsApp:** Meta Business account; 24 h window, approved templates outside it; Meta bills
  templates; per-number fee. A separate product (template UI, onboarding).
- **Telegram / Discord:** weak fit for an inbox (group-only / outbound-only).
- **Snapchat:** not available; remove from marketing or mark "coming soon".

## Global

- One inbox API across platforms (`/v1/inbox/conversations`, `/v1/inbox/comments`,
  `/v1/inbox/reviews`); unsupported calls answer 400 `PLATFORM_LIMITATION`.
- Webhooks: signed, deduped by event id, answer within 5 s, 7 retries over ~51 h.
  `comment.received` real-time for IG/FB/Threads/TikTok, polled for YouTube/LinkedIn/Bluesky.
  `message.received` from IG/FB/TikTok/Bluesky/WhatsApp/Telegram. Review events from Google only.
- **Pricing (team-wide, our bill):** first 2 connected accounts free, then $6/account/month for
  3–10, $3 for 11–100, $1 from 101. Each connection counts (a Page + its Instagram = 2). Profiles
  free. A card is needed before the 3rd account (this is the 402 seen locally on 2026-11-09).
  Outbound messages: 10,000/month free, then $1 per 10,000; comment and review replies don't count.
- Connecting with fewer `scopes` (posting only) loses inbox access.

## Suggested tiers

1. **Full inbox + posting:** Instagram, Facebook (built), Google Business (reviews), TikTok
   (comments + reply-only DMs, region-limited), Threads (comments).
2. **Posting + partial inbox:** YouTube, LinkedIn (company pages), Bluesky; X posting only unless
   someone pays for its API; Pinterest posting only.
3. **Later or not feasible:** WhatsApp (own project), Telegram, Discord, Snapchat (blocked).

## Unconfirmed (check before building)

1. Whether X fires `comment.received` or polls comments.
2. The `xCapabilities` field that turns on X DM polling.
3. Poll intervals for YouTube, LinkedIn, Bluesky comments.
4. Bluesky DMs: push or polled.
5. Telegram: own bot token vs Zernio's shared bot.
6. WhatsApp: one number per profile, or several.
