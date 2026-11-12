# All Zernio platforms: plan

Status: **approved 2026-11-12; wave 1 built (docs/tasks.md T59).** Decided: support every social platform Zernio
offers; the inbox covers what each platform allows; pricing and per-plan account limits come
later. Capabilities and sources: `docs/platforms/RESEARCH.md`.

## 1. Platforms and what Waggle does on each

| Platform | Connect | Posts | Inbox in Waggle |
|---|---|---|---|
| Instagram, Facebook | built | built | built (comments, DMs, FB reviews) |
| Google Business | location pick | updates, offers, events (1 image) | **reviews** (webhooks) |
| TikTok | Business app | video or photos | comments; DM replies (not EU/UK/CH) |
| Threads | OAuth | yes | comments |
| YouTube | channel | video only | comments (polled), moderation instead of hide |
| LinkedIn | person or company | yes | comments (company pages only, polled) |
| Bluesky | app password form | yes | comments (polled), text DMs |
| Reddit | OAuth | yes | comments and messages (to confirm in research before wave 3) |
| X | OAuth, card on file | yes | posting first; comments and DMs only if we accept X's per-call cost |
| Pinterest | board pick | pins (board required) | none (no inbox API) |
| WhatsApp | Meta Embedded Signup | no feed | DMs with 24 h window + approved templates |
| Telegram | Zernio's bot as admin + code | channel/group posts | group/channel messages only |
| Discord | bot + one channel | channel posts | none (outbound only) |
| Snapchat | **blocked by Snap** | (built, "coming soon") | none |

Each platform is one of three kinds in the app: **Answers messages** (full or partial inbox),
**Posts only**, **Coming soon** (not available upstream).

## 2. What changes in the code

The code mostly goes through one list, `SOCIAL_PLATFORMS` (`src/lib/social/types.ts`).

1. **One platform registry** (`src/lib/social/platforms.ts`): per platform the label, icon,
   connect method (OAuth / app password / bot code / embedded signup), post rules (media
   required, max images, video only, board required, text limits), inbox abilities (comments,
   DMs, reviews, hide, private reply, moderation, DM window rules), arrival (real-time / polled)
   and status (available / coming soon). Pages, policy, publishing, MCP tools and the docs read
   from it, so adding a platform is one entry.
2. **Database:** drop the `platform in ('instagram','facebook')` checks on `social_accounts` and
   `conversations` (replace with the full Zernio list). Inbound item kinds stay comment/dm/review.
3. **Connect:** `connectAccount` takes any available platform. OAuth platforms keep Zernio's
   hosted flow (it already does the Page/board/location/channel pick). New: a Bluesky app-password
   form, Telegram code flow, WhatsApp Embedded Signup.
4. **Webhooks:** `comment.received`, `message.received` and `review.*` are already generic in shape;
   map them for every platform, store `platform` on items, verify per-platform ids in the mock
   fixtures. Google reviews arrive by webhook (Facebook reviews stay on polling).
5. **Sending:** replies use the unified inbox endpoints. Per-platform rules move into `policy()`
   from the registry: TikTok DM 10-in-48 h after the customer's last message, WhatsApp 24 h window
   (outside it: a template, or escalate to the owner), Google one reply per review (overwrite).
   Hide becomes "hide or moderate" per platform; private reply stays IG/FB only.
6. **Publishing:** the post composer validates per platform from the registry (TikTok/YouTube need
   video, Pinterest needs a board, Google max 1 image, X link-post cost warning) and sends
   per-platform options.
7. **Analytics:** show what each platform returns; "not available for X" where it doesn't.
8. **AI drafting:** the platform goes into the prompt (length and tone limits, e.g. X 280 chars,
   Google review reply etiquette).
9. **MCP tools and docs:** platform enums come from the registry.
10. **Costs page:** count connected accounts per brand (Zernio bills per account).

## 3. Screens to design first (v3 canvas)

1. **Connect accounts** (Settings → Accounts and a new brand's setup): every platform as a tile,
   grouped Answers messages / Posts only / Coming soon, with what Waggle does there in one line.
2. **Setup steps** that Zernio doesn't host: Bluesky app password, Telegram code, WhatsApp setup.
3. **Inbox:** a platform mark on every row and conversation; a Google review card; a WhatsApp
   "window closed, send a template" state; TikTok "reply-only" note.
4. **Post composer:** platform picker with per-platform rules shown before posting.

## 4. Build waves (each: mock first, then one real test with the 2 free Zernio accounts)

1. **Generic core + connect + posting for all platforms:** registry, migration, connect tiles,
   composer rules, analytics fallbacks.
2. **Inbox wave 1:** Google reviews, Threads comments, TikTok comments and DM replies.
3. **Inbox wave 2:** YouTube, LinkedIn, Bluesky, Reddit, X (X behind a cost decision).
4. **WhatsApp:** templates, window, onboarding.
5. **Telegram, Discord; Snapchat** when Zernio opens it.

## 5. Open items

- Confirm the six unconfirmed points in RESEARCH.md before the wave that needs them.
- Reddit's inbox details (not in the first research pass).
- X: accept per-call cost for its inbox, or posting only.
- Pricing and accounts per plan (later; every connected account costs us $6/$3/$1 a month).
- Landing page copy vs. what each platform actually does.
- A card on Zernio before more than 2 accounts.
