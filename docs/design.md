# Design system: Waggle Hive

Status: v4 (2026-11-13, replaces v3 "Paper") · Source: the client's redesign, copied with our fixes to the canvas page "Redesign (production reference)" (https://claude.ai/artifact/TW1tjpznow8TY81YnoK8dN, boards `R*`). The redesign is a guide, not a pixel spec: where it and this file disagree, this file wins; where this file is silent, follow the redesign.

**Waggle** is the product name. Tagline: **AI that runs your socials.**

**Hive** is warm and calm: cream page, white cards, charcoal ink, honey for what matters. Light and dark are both first-class. It should feel like a tool an owner opens on their phone between customers.

## 1. Rules

1. **Phone first.** Most owners answer from their phone: bottom tabs, Send is the biggest button and sits where the thumb rests, everything reachable with one hand.
2. **Every item says why it came to you**, in plain words ("Price question", "Upset customer", "Photo Waggle couldn't read"), as a chip above the draft.
3. **Approve in one tap.** Waggle's draft sits in the conversation with Send, Edit and I'll answer it.
4. **Honey marks what matters:** the primary action, unread dots and counts, the bee, the active underline. Red only for problems and complaints.
5. **Cards are white on cream** (`--surface` on `--page`), 18px radius, a 1px `--line` border. Lists inside cards use hairline dividers.
6. **Short, human words.** Never "escalated", "classifier", "pending", "webhook", "LLM", "agent", and never the name of our social layer (whitelabel, enforced by `src/features/whitelabel.test.ts`).
7. **No toasts, ever** (§5).
8. **Motion is rare.** Only sign-in and sign-up move (the client wants those pages to feel alive): drifting cards and muted selfie videos. Everything else is a 150ms fade. All motion stops with `prefers-reduced-motion`.
9. **Light, dark or match device**, chosen in the account menu or Settings → Your account → Appearance (phone: More → Appearance). Remembered per device.
10. **Platform logos are the brands' own** (§2), whole and uncropped on a small white tile.

## 2. Logo and brand marks

- **Wordmark:** `waggle.` in **Outfit 700**, lowercase, letter-spacing -0.5px, the full stop in honey `#F6B21B`. 24px in the top bar.
- The bee (`components/app/bee.tsx`) stays for loading, empty states and the 404.
- App icon: `public/brand/waggle-app-icon.svg` (favicon and the connect welcome screen).
- **Platform logos:** files in `public/brands/<slug>.(svg|png)`, drawn by `BrandMark` (`components/app/brand-mark.tsx`): a white rounded tile (radius ≈ 28% of the size, 1px inset `rgba(23,20,15,.10)` ring, ~14% padding) with the logo `object-fit: contain`. Never recolour or crop a logo. Generic marks for SMS, email and phone.

## 3. Tokens

In `src/app/globals.css` as CSS variables mapped into Tailwind; components use tokens only. Dark values apply with `data-theme="dark"` on `<html>` (or "system" and a dark device).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--page` | `#FAF8F3` | `#14110C` | app background (cream) |
| `--surface` | `#FFFFFF` | `#1F1A13` | cards, inputs, panels, dialogs |
| `--subtle` | `#F4F1E9` | `#2A241A` | selected row, hover, customer bubbles, segmented track |
| `--line` | `#ECE8DF` | `#3A3226` | card borders, dividers |
| `--line-strong` | `#D9D2C2` | `#4A4033` | inputs, secondary buttons |
| `--ink` | `#17140F` | `#F5F1E8` | primary text, active tab fill |
| `--ink-2` | `#4F4A40` | `#D8D0C0` | secondary text, nav links |
| `--ink-3` | `#6B6458` | `#ABA290` | meta, labels, times |
| `--ink-4` | `#A39B8B` | `#6B6458` | faint headers (large text only) |
| `--honey` | `#F6B21B` | `#F6B21B` | primary button (ink `#17140F` text always), dots, counts |
| `--honey-hover` | `#E5A50F` | `#F6C350` | primary hover |
| `--honey-text` | `#7A4F00` | `#F6C350` | honey text and links |
| `--honey-tint` / `--honey-border` | `#FFF9EA` / `#F3DFA8` | `#2B2312` / `#6B5420` | banners, "ask first" boxes |
| `--danger` (soft, border) | `#8C2A1E` (`#FCE8E6`, `#F2C6BF`) | `#F2A093` (`#3A1712`, `#5A2A22`) | problems, complaints |
| `--success` (soft) | `#1C5B36` (`#E7F4EC`) | `#7FD3A0` (`#12301F`) | sent, connected |
| `--info` (soft) | `#3A4250` (`#EEF0F3`) | `#B8C2D3` (`#252A33`) | neutral notes |

Text on honey is always `#17140F`, in both themes.

**Type:** **Outfit** (500/600/700) for headings, the wordmark and big numbers; **Inter** (400/500/600/700) for everything else.

| Role | Size / weight |
|---|---|
| Page title | Outfit 32–36 / 600, -0.6px |
| Section | Outfit 18–20 / 600 |
| Body | Inter 14–16 / 400, line-height 1.5 |
| Button | Inter 14 / 600 |
| Meta | Inter 12–13 / 400–500, `--ink-3`, tabular numbers |

**Radius:** buttons and inputs 12, chips full, cards 18, panels and overlays 18. **Depth:** borders do the work; overlays (menus, the bell panel, dialogs) get `0 12px 32px rgba(23,20,15,.14)`.

## 4. Components

- **Top bar** (desktop): white, hairline bottom, 68px. `waggle.` · six tabs (**Today, Inbox, Contacts, Posts, Teach Waggle, Insights**; active = ink fill, white text, 10px radius; Inbox shows a honey count) · the **bell** · the **account button** (business initials + name) which opens the account menu: Settings, Dark mode, Help and contact us, Send feedback, switch business, + Add another business, Staff tools (admins only), Log out.
- **Bottom tabs** (phone): Today, Inbox, Contacts, Teach, More. Posts, Insights and Settings live under More. A honey dot on More when there are unread notifications; More starts with a Notifications row.
- **Bell:** on every desktop page. Panel 380px: Notifications, Mark all read, tabs All / For you / Updates, rows with a honey unread dot, "Choose what you get told about" → Settings.
- **Buttons:** primary honey (ink text), secondary white with `--line-strong`, dark (ink fill, white text) for a second strong action, quiet text. 44px tall (38 inside cards). A button that can't work says why next to it ("Can't send on Instagram · Instagram stopped connecting · Reconnect").
- **Bulk actions confirm in place** ("Send 3 replies? To Jordan, Lena and Chris" · Send 3 · Cancel). Never a browser dialog.
- **Chips:** 12/600, full radius, soft fill + strong text (reason, status, counts).
- **Segmented control:** `--subtle` track, white active segment with a small shadow.
- **Inputs:** `--surface`, 1px `--line-strong`, 12px radius, real `<label>`, errors in `--danger` under the field.
- **Reconnect bar:** one thin bar that says what it costs ("3 messages waiting"), never a big card on every page.
- **Conversation:** customer bubbles `--subtle`; the draft card shows the reason chip, "Waggle's reply · from your answer …", Send / Edit / I'll answer it.

### Beyond text (approved 16 Nov)

Nothing is told apart by bold, size or underline alone. Five rules, shared pieces in `src/components/app/` (canvas: Built page, "Design decision (approved 16 Nov)"):

1. **A card's action has an arrow** (`ActionLink`, `.action-link`): ink, semibold, `→`; a soft pill and a nudge on hover. "Plan posts →", "See all →". Never underlined.
2. **Places are tabs** (`SectionTabs`, the `.tabs` style): a page's parts sit as tabs under its title (Posts: Calendar · Posting times · Ads · Blog · Shop). View controls (dates, Week · Month · List) get their own row. No rows of underlined links, no "← Back" links.
3. **States are honeycomb cells** (`StateMark`, `StateLabel`): the word stays plain, a small hexagon beside it carries the meaning. Full honey = working, half = waiting, red outline with a bar = needs you (word in red), empty outline = off, dashed outline = coming soon. No pastel pills for states. Problems keep their action next to them ("Reconnect →").
4. **Empty spots are an empty cell with one next step** (`EmptySpot`, `EmptyCell`, `.empty-slot`): the dashed hexagon with a plus, one sentence, at most one real button. Where it can be filled in place (a day in the week), the cell fills with honey on hover and says what it does. A whole empty page uses the bee.
5. **A link inside a sentence sits on a honey highlight** (`.link-inline`): ink, semibold, a honey strip under the lower half; the strip fills the word on hover. Only inside sentences.

### Inbox polish (approved 16 Nov)

- The Inbox is two cards that fill the screen on desktop: the list (search and tabs pinned on top, rows scroll under them) and the conversation with the customer column beside it, split by a hairline.
- The open row has a soft honey tint and a thin honey outline; no side bar.
- Channel logos are shown in colour wherever a customer appears (avatar badge, conversation header, customer panel), the same logos as Connect an account. This replaces the older "no logos" rule for avatars.
- Search covers names, the customer's words and Waggle's replies across For you, Answered and Hidden; `/` jumps into it; results say which tab they're in and highlight the match.
- "Couldn't send" is said once: one red box naming what closed and what to do. Open in <app> sits in the conversation header as an arrow action.
- Activity is a honeycomb timeline with times; the answer a reply came from is a honey link.

## 5. Feedback without toasts

- **Sending:** the button shows "Sending…" and is disabled.
- **Sent:** the item says so in place ("Sent. Maya will see it on Instagram.") with Undo for 8 seconds.
- **Couldn't send:** the item stays with a danger box: the reason and the fix.
- **Account-wide problems:** the reconnect bar or a banner at the top of the page, until fixed.
- No toast library anywhere.

## 6. Bee and motion

The bee (black outline, honey body, white wing) stays for loading (a page waiting over a second), "all caught up" empty states and the 404. Sign-in and sign-up keep the redesign's drifting cards and muted autoplay selfie videos (with a still poster). `prefers-reduced-motion`: everything stops, videos show their poster.

## 7. Voice

- Confident, warm, short. The owner runs the business; Waggle runs the socials.
- "Good morning, Walter." · "Since yesterday, Waggle answered 12 messages on its own." · "Only you can answer 2."
- Calm and clear for complaints, money and errors; no jokes there.

## 8. Layout

- Content up to 1320px with 24px gutters (16 on phones).
- Desktop pages: title row (title + one line + actions on the right), then cards in a grid. Inbox: list | conversation | customer panel.
- Phone: 390px screens, bottom tabs, sticky primary action.
- Page titles "… · Waggle".
