# Everything Zernio offers: research for the whitelabel push

Researched 2026-11-13 from docs.zernio.com (docs MCP, read only, no API calls) and the
`@zernio/node` SDK types. Goal: every Zernio feature in Waggle, Zernio invisible to customers
(deadline 2026-11-18). Waggle already has social posting (all platforms, video, scheduling,
Pinterest boards), the social inbox (comments, DMs, reviews, WhatsApp templates) and IG/FB
analytics (docs/platforms/).

## Billing facts that shape everything

- One Zernio team = one card for every business. A failed payment pauses every business (/multi-tenant).
- Phone, SMS, RCS, iMessage, creator campaigns, support assistant need usage-based billing with a card.
- Connected accounts: 2 free, then $6/$3/$1 per account a month. A Page + its Instagram + the Meta
  ad account behind them = 3. Each mailbox, phone number, store is an account.
- Outbound messages (DMs, broadcasts, automations): 10,000 free per team per month, then $1 per 10,000.
- Automation runs: 2,000 free per month, then $2 per 1,000 (/pricing/automations).
- Ads: the network bills the business's own ad account; Zernio takes no % of spend. Managed ads:
  500 active ads free, then $0.01 per active ad a month (/pricing/ads).
- Phone: numbers $3–$30/month (US $3); outbound calls from $0.010/min; SMS from $0.008/segment;
  10DLC $9 once + $20/month ($4 sole proprietor) (/pricing/phone).
- RCS: $150 setup + $750 on US approval + $160/month (US); $1,060 prepaid up front; 4–6 weeks.
- iMessage: $200 per sender a month.
- WhatsApp template fees: Meta bills the business's own WhatsApp Business Account.

## Social (finish)

- Queue: `POST /v1/queue/slots` {profileId, name, timezone, slots[{dayOfWeek 0–6, time "HH:mm"}]};
  `GET /v1/queue/slots?profileId`, `GET /v1/queue/next-slot`; posts with `queuedFromProfile`
  (+ optional `queueId`), never `scheduledFor` = nextSlot (no lock). 409 `queue_slot_conflict`.
- Post types: Facebook `contentType: story|reel`; Instagram `contentType: story` (+`shareToFeed`);
  YouTube Shorts; Snapchat story/spotlight.
- First comment: `firstComment` on Instagram, Facebook, LinkedIn, YouTube, Threads (SDK).
- Text per platform: `customContent` on each platform target; `customMedia` for media.
- Published posts: `unpublishPost` (take down), `updatePost` (scheduled), `retryPost`.

## Automations

- Comment-to-DM: `POST /v1/comment-automations` {profileId, accountId, name, platformPostId?
  (none = account-wide; IG media id from GET /v1/external-posts), trigger comment|story_reply|
  story_mention|live_comment, keywords[], matchMode contains|word|exact, dmMessage, buttons[],
  quickReplies, commentReply, publicReplyPolicy after_dm|always, repeatPolicy{mode, cooldownHours},
  actions{likeComment, hideComment}, isActive}. Placeholders {{first_name}} {{name}} {{username}}.
  IG/FB DM + buttons; TikTok/Threads/LinkedIn/YouTube public reply only; X refused. Logs:
  `GET /v1/comment-automations/{id}/logs` (status sent|failed|skipped|gated|pending, misses).
  Only comments after activation; one active per-post automation (409). IG: no buttons in a
  first private reply to a non-follower.
- Workflows (ManyChat-style): `POST /v1/workflows` {profileId, accountId, platform, name, nodes[],
  edges[]} → draft → `/activate` `/pause`; 17 node types (send_message, condition, delay,
  wait_for_reply, add_tag, set_field, enroll_sequence, webhook, ai, handoff, …); triggers DM
  keyword, ig.me/m.me ref link/QR, comment, story mention, reaction, Meta lead form, API;
  `POST /v1/workflows/{id}/trigger`. IG/FB: 24 h window. Sequences: `POST /v1/sequences`, `/enroll`.
- Event automations / ad rules: `POST /v1/automations`, catalog `GET /v1/automations/catalog`,
  step `approval.request`; `POST /v1/ads/rules`, templates `GET /v1/ads/rules/templates`.
- Webhooks: workflow.run.*, sequence.*, contact.*, message.sent with `sentVia`.

## Contacts and broadcasts

- Contacts: `POST /v1/contacts` {profileId, name, email, company, tags[], isSubscribed, notes,
  accountId+platform+platformIdentifier}; `POST /v1/contacts/bulk` (≤1,000); custom fields.
- Broadcasts: `POST /v1/broadcasts` {profileId, accountId, platform, name, segmentFilters,
  template{name, language, components, variableMapping{"1":{field:"name"}}}} → recipients
  (`phones[]`|`contactIds[]`|`useSegment`) → `/send` or `/schedule` {scheduledAt}; stats
  sent/delivered/read/failed. Platforms incl. whatsapp, instagram, facebook, telegram, sms, …
  (only WhatsApp documented in detail).
- New WhatsApp numbers: 250 unique contacts a day (TIER_250). Consent capture not documented:
  Waggle must record opt-in itself.

## Ads

- Connect: `GET /v1/connect/facebook/ads?profileId&loginMode=classic|business`; ad accounts
  `GET /v1/ads/accounts?accountId`; health `GET /v1/ads/accounts/health`.
- Boost: `POST /v1/ads/boost` {postId|platformPostId, accountId, adAccountId, name, goal,
  budget{amount (whole units), type daily|lifetime}, schedule{startDate,endDate},
  targeting{ageMin, ageMax, countries, cities+radius, zips, interests}, linkUrl+callToAction,
  status:"PAUSED"} + Idempotency-Key; → pending_review. Boost on Meta, Google, LinkedIn, TikTok,
  Pinterest, X, Reddit.
- Status: `PUT /v1/ads/campaigns/{id}/status`; analytics `GET /v1/ads/campaigns`,
  `/campaigns/{id}/analytics` (spend, impressions, reach, clicks, ctr, cpc, conversions).
- Webhooks: ad.review.approved/rejected, ad.delivery_issue, campaign.status_changed, lead.received.
- The business needs its own ad account + payment method; every ad is reviewed by the network.

## Phone

- Numbers: `GET /v1/phone-numbers/available` {country, numberType, areaCode, …}; `POST
  /v1/phone-numbers/purchase` {profileId, country, phoneNumber, wantsSms, connectWhatsapp:false,
  purchaseIntentId}; KYC countries 202 kyc_required; one number per profile. Porting
  `/v1/phone-numbers/port-in`.
- Voice: `POST /v1/phone-numbers/{id}/voice` {forwardTo, voicemailEnabled, voicemailGreeting,
  businessHours, ivrOptions, blockedCallers, recordingEnabled, transcriptionEnabled}; outbound
  `POST /v1/voice/calls`; history `GET /v1/calls`. AI voice agents over SIP/wss.
- SMS: enable `POST /v1/phone-numbers/{id}/sms`; send `POST /v1/sms/messages` {from, to, text,
  mediaUrls, sendAt}; opt-outs `GET /v1/sms/opt-outs`. US needs 10DLC/toll-free registration
  `POST /v1/sms/registrations` (statuses requested→pending→approved…, can fall back).
- Webhooks: call.received/ended/failed/recording_ready, message.received platform sms,
  sms.registration.status_updated/action_required.

## More messaging channels

- RCS (`POST /v1/rcs/agents`, 4–6 weeks, $1,060 up front), iMessage ($200/sender/month, strict
  pacing), Telegram inbox (DMs to the shared bot), LINE (`POST /v1/connect/line/credentials`),
  WeChat (verified Service Account, IP whitelist), Slack (OAuth, bot `@Zernio`).

## Workspace

- Google `GET /v1/connect/google?scopes=email,calendar,files,contacts`; Microsoft OAuth; IMAP
  hosted `GET /v1/connect/email`.
- Email: `GET /v1/email/messages|threads`, `POST /v1/email/messages`, drafts
  `POST /v1/email/drafts` {inReplyTo} → `/drafts/{id}/send` (If-Match). Emails appear as inbox
  conversations. Caps: Gmail 200/day, Microsoft 1,000.
- Calendar: `GET/POST /v1/calendar/events`, `POST /v1/calendar/availability`; primary calendar
  only; no hosted booking page.
- Files: `/v1/files` (Drive only sees files Zernio made or the user picked).

## Blogs and commerce

- Blogs (Shopify, WordPress, Wix, Webflow): `GET /v1/accounts/{id}/blogs`, `POST
  /v1/accounts/{id}/blogs/{blogId}/articles` {title, bodyHtml, tags, author, excerpt, image,
  seo, isPublished, publishDate}.
- Commerce (Shopify, WooCommerce): `GET /v1/commerce/store`, `/v1/commerce/products` (+inventory),
  `/v1/commerce/orders`; webhooks commerce.order.*, commerce.product.*.
- HubSpot (sync contacts + log messages), Google Analytics (GA4 reports), Stripe (read-only,
  purchases for ad attribution).

## Other

- Creator campaigns: pay creators per views/engagement or commission; 4% fee; usage billing.
- Support assistant: Zernio's support agent for our ops team (not owners).

## Whitelabel: where "Zernio" can reach a customer

Checked page by page 2026-11-13 (sources in brackets).

- Platform permission screens name "the Zernio app" (/multi-tenant, White-label). On Meta that app
  is "Social Media Connector" (seen on a real Instagram connect from app.gowaggle.ai). The display
  name on other platforms is not documented: check once per platform.
- Telegram: bot `@LateScheduleBot`, shown as "Social Media Connector"; group posts show that name,
  "cannot be changed" (/platforms/telegram). An older page says `@ZernioScheduleBot`; the API returns
  `botUsername`, which Waggle shows live.
- Own apps (`POST /v1/connect/oauth-apps`, `oauthAppId` on connect; /multi-tenant/own-apps):
  Instagram, Facebook, Threads, WhatsApp, YouTube, Google Business, Google (Gmail/Calendar/Drive),
  Microsoft, X, LinkedIn, TikTok, Pinterest, Snapchat, Reddit, Slack. Meta ads connects and WhatsApp
  Embedded Signup stay on Zernio's app.
- No Zernio app at all: Bluesky (app password), Shopify custom-app Admin token `POST
  /v1/connect/shopify/token`, Webflow site token `POST /v1/connect/webflow/token` (blogs only),
  self-hosted WordPress Application Password `POST /v1/connect/wordpress/token`, WhatsApp System User
  credentials `POST /v1/connect/whatsapp/credentials`, LINE and WeChat keys. Pixels on Shopify/Webflow
  need the Zernio app (OAuth).
- Named "Zernio": HubSpot (listed as "Zernio" in Connected apps; no other route), Slack bot `@Zernio`
  (/platforms/slack says no own app; /multi-tenant/own-apps lists Slack: conflict, ask Zernio), Wix
  ("the Zernio app", installer only).
- Hosted on zernio.com: welcome screen (our brand, our Terms/Privacy via `welcomeTheme`), OAuth
  callback `zernio.com/api/v1/connect/{platform}/callback`, WhatsApp `signup=hosted` page
  ("co-branded, not white-label": don't use), KYC page (brandable), SMS registration (not brandable).
- Snapchat is unavailable: "Snap has not approved Zernio's app", every connect `403
  PLATFORM_BETA_RESTRICTED` (/platforms/snapchat).
- Not documented: media URL domain, email tracking domains, custom domains, ads own apps beyond Meta.
