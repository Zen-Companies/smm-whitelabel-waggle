# Design system: Waggle Paper

Status: v3 (2026-10-30, replaces the dark-first v2) · Source: the "Waggle screens v3" design canvas (https://claude.ai/artifact/APD9ZyZM7q9q8zUnvzmbMm): "Theme 1 · Paper", "Paper rules", "Inbox · Paper", "Bee motion".

**Waggle** is the product name. Tagline: **AI that runs your socials.** Headline line: **Your socials, handled.**

The story: bees dance a figure-8 (the waggle dance) to tell the hive where the good flowers are. Waggle does the same for a business's page: it finds the comments that are real customers and tells the owner.

**Paper** is white-first, quiet and precise. Black, gray and white do the work; honey marks the few things that matter; the bee and its figure-8 are the only personality. It should read like a well-made professional tool, never like a template.

## 1. The ten rules

If a screen breaks one, it starts to look generic.

1. **Lists aren't boxed.** Rows sit on the page with hairline dividers. Boxes are only for real objects: the reply composer, side panels, dialogs, forms.
2. **State is weight and fill, never stripes.** Needs you = a 6px honey dot + semibold name. Selected = a whole-row `--subtle` fill. Handled = regular weight, gray text. No colored left borders, ever.
3. **Honey, three times a screen at most:** the primary action, the needs-you dots, the bee. Red only for complaints and errors. Everything else is black, gray and white.
4. **Every list row has the same three lines:** who (+ time on the right) · what they said · what happens next, in plain words ("Reply ready to send", "Lead · reply ready", "Complaint · for you to answer"). A small icon at the start of line 3 marks leads, complaints and "not in your business info".
5. **A small type scale:** 24 / 20 / 16 / 14 / 13 / 12, weights 400 / 500 / 600 (700 only for the wordmark). Times use tabular numbers, right-aligned.
6. **An 8px grid:** padding 16, list rows ~72px (three lines), page gutter 32 (16 on phones), gaps 8 / 16 / 24. Radius 8 for controls, 12 for panels; nothing rounder except avatars and dots.
7. **Quiet icons:** lucide at 1.5px stroke, gray. A small Instagram or Facebook mark on the avatar instead of words. Icons explain; they never decorate.
8. **Only the bee moves** (§6). Everything else: a 150ms fade. All motion stops with `prefers-reduced-motion`.
9. **Short, human words:** "4 things need you." "Reply ready." "Carlo wants a table for 8." Never "escalated", "classifier", "pending", "webhook", "LLM" or "agent".
10. **One signature, the figure-8:** the trail shows up quietly in loading, the sent confirmation and empty states. It's what makes this Waggle and not a template.

## 2. Logo

Files in `public/brand/` (the mark is unchanged from v2):

| File | Use |
|---|---|
| `waggle-mark-light.svg` | Mark on light (default) |
| `waggle-mark-dark.svg` | Mark on dark (marketing) |
| `waggle-mark-small.svg` | Trail only, under 48px |
| `waggle-app-icon.svg` | App icon / favicon |

- Wordmark: `waggle` in **Inter 700**, lowercase, letter-spacing -0.035em, then a **honey full stop**. Built as text: `waggle<span class="text-honey">.</span>`. In the top bar: wordmark alone, 19px.
- Never recolor, stretch or add effects to the mark.

## 3. Tokens

In `src/app/globals.css` as CSS variables, mapped into Tailwind; components use tokens only.

| Token | Hex | Use |
|---|---|---|
| `--page` | `#FFFFFF` | app background |
| `--surface` | `#FFFFFF` | panels, inputs, dialogs (always with a border) |
| `--subtle` | `#F5F5F4` | selected row, hover, chat bubbles from customers, skeletons |
| `--line` | `#E7E5E4` | hairline dividers, panel borders |
| `--line-strong` | `#D6D3D1` | input and secondary button borders |
| `--ink` | `#18181B` | primary text, icons that matter, the owner's chat bubbles, active tab underline |
| `--ink-2` | `#52525B` | secondary text, nav links, customer message previews |
| `--ink-3` | `#71717A` | meta, labels, times |
| `--ink-4` | `#A1A1AA` | faint group headers, counts on inactive tabs (large text only) |
| `--honey` | `#F5B014` | primary button fill (ink text on it), needs-you dot, bell dot, the bee |
| `--honey-hover` | `#E5A50F` | primary button hover |
| `--honey-text` | `#92600A` | honey-colored text and links on white (AA) |
| `--honey-tint` | `#FFF7E0` | account-wide banner, soft highlight (border `--honey-border` `#F5D98C`) |
| `--danger` | `#B42318` | complaint label, inline errors (box `#FEF3F2`, border `#FECDCA`) |
| `--success` | `#15803D` | answered check (soft `#F0FDF4`) |

Never put white text on honey; use ink. Plain honey is never used for text on white (use `--honey-text`).

**Type:** Inter (Google Fonts, 400/500/600/700) for everything.

| Role | Size / weight |
|---|---|
| Page headline | 24 / 600, -0.02em ("4 things need you") |
| Section | 16–20 / 600 |
| Body | 14–15 / 400, line-height 1.45–1.5 |
| Button | 14 / 600 (primary), 500 (others) |
| Meta | 12–13 / 400–500, `--ink-3`, tabular numbers |

**Depth:** borders do the work. One shadow, only on overlays (menus, the notification panel, dialogs): `0 12px 32px rgba(24,24,27,.12)`.

## 4. Components

- **Top bar** (replaces the sidebar): 56px, white, hairline bottom. Wordmark · nav links (Inbox, Posts, Leads, Business info, Lab, Settings; admin links for operators) · on the right the flying-bee status with the business name, the bell, and the account menu (sign out). Active link = ink text + 2px ink underline. On phones the nav scrolls sideways under the brand row.
- **Buttons:** Primary = honey fill, ink text, 8px radius, 40–44px tall. Secondary = white, 1px `--line-strong`, ink text. Quiet = text only, `--ink-2`. Destructive = text only, `--danger`.
- **Tabs** (inbox For you / Answered / Ignored, settings sections): text with a 2px ink underline when active, count in `--ink-3`. No pills.
- **Inputs:** white, 1px `--line-strong`, 8px radius, 40–44px; focus = ink border + 3px `rgba(24,24,27,.08)` ring. Errors: danger text under the field. Real `<label>` always.
- **Segmented control** (Off / Ask me first / Auto-reply): `--subtle` track, 8px radius; active segment white with a `--line-strong` border.
- **List row** (inbox, leads, notifications): rule 4's three lines, 36px avatar (customer photo; fallback `--subtle` circle with a person icon in `--ink-3`, never initials) with a 16px platform mark, honey dot before the name when it needs the owner. Selected = `--subtle` fill, 8px radius.
- **Conversation:** no box. Customer bubbles `--subtle`, the business's bubbles ink with white text, 12px radius with a 4px corner on the sender's side. Day separators in `--ink-4`.
- **Reply composer:** the one boxed object: white, 1px `--line-strong`, 12px radius. "Waggle's reply, from [topic]" · the draft (editable) · footer: quiet "Don't reply", keyboard hints `A send · E edit · J next`, primary "Send". Keep the A / E / J shortcuts and the 8-second Undo.
- **Category labels:** words, not chips: `Lead` in `--honey-text` and `Complaint` in `--danger` with their icon at the start of row line 3; questions and unclear messages have no label.
- **Inbox header:** "N things need you" (24/600) and one gray line "Today Waggle answered X and ignored Y." No summary card.
- **Side panel** (customer, activity, next post): plain text blocks with 12px `--ink-4` labels, no boxes.
- **Banner** (account-wide problems, paused replies, AI allowance): `--honey-tint` with a `--honey-border` hairline, ink text, one fix link. Stays until fixed.
- **Notification panel:** overlay (white, 12px radius, the overlay shadow), title 16/600, tabs All / For you / Updates, rows like list rows with a honey unread dot.
- **Loading:** lists use gray skeleton rows in `--subtle` (never spinners on lists); whole pages that wait over a second use the bee loader (§6).

## 5. Feedback without toasts

- **Sending:** the primary button shows the mini bee loop + "Sending", disabled.
- **Sent:** the composer collapses to one row: green check, the figure-8 trail traces once, "Answered [name] · 2:14 PM", underlined "Undo" for 8 seconds; then it moves to Answered.
- **Couldn't send:** the item stays in For you with a danger box: the reason and the fix ("Copy reply" / "Mark as handled").
- **Account-wide problems:** one banner at the top of the page (§4).
- No toast library anywhere.

## 6. Bee motion

One bee everywhere: black outline, honey body with two stripes, white wing, dotted trail. Components in `src/components/app/bee.tsx`.

| Moment | The bee | Words |
|---|---|---|
| **Loading** (a page or panel waiting over a second) | flies the figure-8 while the trail draws in honey | "Getting your messages…" |
| **404** | loses the figure-8 and wanders, ending at a "?" | "This page flew off." · Back to your inbox |
| **Something went wrong** | rests on a closed honeycomb cell, wings still, breathing slowly | "We couldn't load this. Your messages are safe." · Try again |
| **All caught up** (empty inbox, no leads, fresh account) | hovers beside a flower, wings fluttering, a slow bob | "Nothing needs you. Go run the shop." |
| **Small moments** | a mini loop in the Send button; the trail traces once by the check; a short wiggle on the bell when something new needs you | — |

- Humor only on the 404. Errors, complaints and money stay calm and plain.
- Wings flap from where they join the body (`transform-box: fill-box`).
- `prefers-reduced-motion`: every animation stops and the bee shows still.

## 7. Voice

- Confident, warm, short. The owner runs the shop; Waggle runs the socials.
- "Your socials, handled." · "4 things need you." · "Reply ready." · "Nothing needs you. Go run the shop."
- Plain words: replies, comments, messages, customers, posts.
- Calm and clear for complaints, money and errors; no jokes there.

## 8. Layout

- App shell: the top bar, then content centered up to ~1240px with 32px gutters (16 on phones).
- Inbox: list (~360px) | conversation (max ~600px) | side panel (~220px) on desktop; list → conversation on phones.
- Screens: Inbox, conversation page, Posts, Leads, Business info, Lab, Settings, login/signup, notification panel, admin costs, 404 and error pages.
- Favicon and app metadata from `waggle-app-icon.svg`; page titles "… · Waggle".
