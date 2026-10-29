# Design system: Friendly Local (refined)

Status: v1 · Brand name TBD (use `[Brand]` everywhere a name would go) · Source: design canvas "AI Receptionist Brand Directions", Friendly Local boards.

Warm and a little playful, never cheap. Personality lives in the display type, the words, spot illustrations and a few signature moments. Everything else is calm, neutral and precise.

## 1. Principles

1. **Playful where it's safe:** page titles, empty states, first wins, onboarding, copy.
2. **Precise everywhere else:** lists, forms, settings are quiet: neutral grays, tight alignment, no decoration.
3. **Color with a job:** violet = act here, coral = a lead, amber = needs attention. No job → gray.
4. **Feedback on the thing:** no toasts, ever. What you act on changes in place; errors stay where they happened.

## 2. Tokens

Put these in `src/app/globals.css` as CSS variables and map them in Tailwind/shadcn. Use tokens, never raw hex in components.

### Color

| Token | Hex | Use |
|---|---|---|
| `--gray-25` | `#FCFBF9` | page background |
| `--gray-50` | `#F6F4F1` | subtle fills, segmented track, draft box, skeletons |
| `--gray-100` | `#ECE9E4` | borders, dividers |
| `--gray-200` | `#DCD8D1` | input and secondary button borders, avatar fallback |
| `--gray-400` | `#A39EAF` | decorative only (never text) |
| `--gray-600` | `#6B6680` | secondary text, meta, captions |
| `--gray-700` | `#4A4560` | body-secondary text, nav items |
| `--ink` | `#1A1033` | primary text, icons |
| `--surface` | `#FFFFFF` | cards, sidebar, panels |
| `--violet` | `#5B3DF5` | primary action ONLY, focus ring, unread dot, bell count |
| `--violet-strong` | `#3A22B5` | text on lavender, active nav |
| `--violet-busy` | `#8F7BF7` | primary button while sending |
| `--lavender` | `#F4F1FF` | selected state ONLY (selected row, active nav) |
| `--focus-ring` | `#E9E4FF` | 3px ring around focused inputs |
| `--coral` | `#FF6F59` | lead dot, celebrations |
| `--coral-soft` | `#FFF4F1` | lead chip background |
| `--coral-text` | `#8A2414` | text on coral-soft |
| `--amber` | `#C77700` | complaint dot, caution icons |
| `--amber-text` | `#8F5A00` | complaint label text |
| `--amber-soft` | `#FFF8EB` | banner background (border `#F1DDB4`, text `#5C3A00`) |
| `--success` | `#2F7D4F` | sent check icon (bg `#EEF7F1`) |
| `--danger` | `#A3261A` | inline errors, destructive text (bg `#FFF7F6`, border `#F3C9C3`) |

Balance: ~75% neutral surfaces, ~13% gray structure/text, under 15% color. Never white text on coral or amber. All text pairs must meet WCAG AA (4.5:1).

### Type

- **Bricolage Grotesque** (Google Fonts, 700/800): marketing, page titles, empty-state headlines, notification panel title. Never below 24px.
- **DM Sans** (Google Fonts, 400/500/600): everything else.

| Role | Size / weight | Font |
|---|---|---|
| Page title | 32 / 700, letter-spacing -0.02em | Bricolage |
| Empty-state headline | 28 / 700 | Bricolage |
| Section | 18 / 600 | DM Sans |
| Body | 15 / 400, line-height 1.6 | DM Sans |
| Label / button | 14 / 500 (primary button 600) | DM Sans |
| Meta | 12–13 / 500, `font-variant-numeric: tabular-nums` | DM Sans |

### Shape, spacing, depth

- Radius: `8` tags/kbd · `12` inputs, buttons, nav items · `16` cards · `24` dialogs, notification panel · `full` primary button and avatars only.
- **The pill is the signature: one pill (the primary action) per screen.** Inner radius always smaller than its container.
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- Depth: **Flat** = 1px `--gray-100` border (default). **Lifted** = border + `0 1px 2px rgba(26,16,51,.05), 0 4px 12px rgba(26,16,51,.04)` (focused card). **Overlay** = `0 16px 40px rgba(26,16,51,.14)` (dialogs, menus, notification panel). No colored shadows, no gradients.
- Motion: 150–200ms ease-out. One signature moment: a small settle when a reply is sent. No motion on complaints, billing or errors. Respect `prefers-reduced-motion`.

## 3. Components

- **Buttons:** Primary = violet pill, 44px tall, white 600 text. Secondary = white, 1px `--gray-200` border, 12px radius. Quiet = text only, `--gray-700`. Lead action = coral-soft bg, `#FFC7BC` border, coral-text. Destructive = text only, `--danger`. Minimum height 44px everywhere.
- **Inputs:** 44px, 12px radius, 1px `--gray-200`; focus = 1px violet border + 3px `--focus-ring`. Errors: danger text under the field, never color alone. Always a real `<label>`.
- **Segmented control** (autonomy: Off / Ask me first / Auto-send; inbox filters): `--gray-50` track, 12px radius, 4px padding; active segment white with 1px `--gray-100` border.
- **Category labels:** Lead = coral-soft chip with coral dot. Complaint = amber dot + amber-text label. FAQ / Unclear = plain `--gray-600` text. Spam hidden by default.
- **Status:** inline text + icon, never colored chips.
- **Avatars:** customer's real profile photo from the platform; fallback = `--gray-50` circle with a 1.75px person icon. Never colored initials.
- **Inbox list:** dividers, not boxes. Selected row = `--lavender`, 12px radius. Unread = name 600. Time in meta style.
- **Approval card:** Lifted card, 16px radius. Header: avatar, name, platform + time, category label. Customer message, then draft in a `--gray-50` box (editable textarea when editing). Footer: primary "Approve and send" pill, secondary "Edit", quiet "Don't reply". Keyboard hints at right: `A` approve, `E` edit, `J` next (implement the shortcuts).
- **Icons:** lucide-react, 1.75px stroke, `--ink` (or `--gray-700` in nav). No icon tiles or colored icon backgrounds, except notification type circles (below).
- **Loading:** skeletons shaped like the content, never spinners on lists.

## 4. Feedback without toasts

- **Sending:** the primary button shows a small spinner + "Sending", background `--violet-busy`, disabled.
- **Sent:** the card collapses into one row: success check, "Sent to [name] · 2:14 PM", underlined "Undo" link (8 seconds), then the item leaves the queue for the Sent tab.
- **Couldn't send:** the card stays; danger box under the draft with the reason and the fix (e.g. "Instagram's 24-hour reply window has closed." + "Copy reply" / "Mark as handled").
- **Account-wide problems** (disconnected account, Zernio paused): one amber banner at the top of the page, stays until fixed, with a single fix button.
- Never use a toast library. Remove `sonner`/toast if present.

## 5. Notification center (in-app)

- Bell button (44px, 12px radius, secondary style) in the top bar or sidebar; violet count badge = unread items that need action only.
- Click opens a panel (overlay depth, 24px radius, ~420px wide): title "Notifications" in Bricolage, "Mark all read" link, tabs All / Needs you / Updates, groups Today / Earlier.
- Each row: 36px type circle (lead = coral-soft + person icon; complaint/account = amber-soft + icon; sent summary = success bg + check; post = lavender + post icon), title (600 if unread), meta line, optional inline action ("Review reply", "Reconnect"), violet unread dot.
- Every notification links to its item and is marked read when that item is opened anywhere.
- Updates batch ("5 replies sent automatically"); leads, complaints and account problems are one per event.
- Source: the alerts written in T13 plus post and auto-send events. Phone push, quiet hours and per-event channel settings are out of scope for now.

## 6. Spot illustrations

Files in `public/illustrations/`: `inbox-clear.svg`, `connect-accounts.svg`, `new-lead.svg`, `reconnect.svg`.

- Style: 2.5px `--ink` outline, round joins, flat fills from the palette. Objects from a small shop, never mascots, robots or AI imagery.
- Use only in empty states, onboarding/first run, first wins and gentle problems. Never in lists, tables, forms or complaint screens.
- Placement: on a soft tinted panel (lavender, coral-soft or gray-50), 16px radius, with a Bricolage headline and one friendly line below.

| Screen | Illustration |
|---|---|
| Inbox empty ("all caught up") | inbox-clear |
| First run / no accounts connected | connect-accounts |
| Leads page empty, first lead | new-lead |
| Account disconnected page state | reconnect |

## 7. Copy

- Plain words: "replies", "messages", "business info". Never "webhook", "LLM", "classifier", "AI agent".
- Warm, short, one idea per sentence. Playful only in empty states and celebrations; calm and clear for complaints, money and errors.
- English by default; Taglish examples are fine in demo content.

## 8. Layout

- App shell: white sidebar (210–240px) with `[Brand]` wordmark (Bricolage 24/800) + violet dot logo placeholder; main area on `--gray-25`, 32–40px padding, max content width ~1200px.
- Pages are responsive: sidebar stacks on phone widths, two-pane inbox becomes list → detail.
- Screens to style: Inbox (list + detail), item conversation page, Posts (list + compose + schedule), Leads, Business info (knowledge base), Settings (accounts, autonomy, notifications), login/signup, notification panel.
