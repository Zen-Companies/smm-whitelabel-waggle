# Design system: Friendly Local (refined)

Status: v2 · Brand name TBD (use `[Brand]` everywhere a name would go) · Sources: design canvas "AI Receptionist Brand Directions", Friendly Local boards (tokens, components); canvas "AI Receptionist: screen design v2" (layout and screens, §8).

Warm and a little playful, never cheap. Personality lives in the display type, the words, spot illustrations and a few signature moments. Everything else is calm, neutral and precise.

## 1. Principles

1. **Playful where it's safe:** page titles, empty states, first wins, onboarding, copy.
2. **Precise everywhere else:** lists, forms, settings are quiet: neutral grays, tight alignment, no decoration.
3. **Color with a job:** violet = act here, coral = a lead, amber = needs attention. No job → gray.
4. **Feedback on the thing:** no toasts, ever. What you act on changes in place; errors stay where they happened.
5. **Outcomes, not machinery:** owners read "Recognized as a lead", never model names, tokens or costs. Those live only on the operator's Costs page.

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
- **Conversation (inbox detail):** lifted card, 16px radius. Header: avatar, name, platform + kind, category label. The thread: customer messages left on `--gray-50` (bottom-left corner 4px), your replies right on white with a 1px border and "Sent by you" / "Auto" under them; day separators in meta style. The footer is the action:
  - **Suggested reply (composer):** 1px `--gray-200` box, 16px radius, at the bottom of the conversation. "Suggested reply" + "Based on your business info: X" on one line, the draft (textarea when editing), then primary "Approve and send", secondary "Edit", quiet "Don't reply", and at right the DM window ("23 h left to reply") and the keyboard hints `A` approve, `E` edit, `J` next.
  - **Needs you:** the reply that couldn't go out (if any), then the problem where the send button would be: a danger box "Couldn't send: …" for send failures, or a calm `--gray-50` line for complaints and questions the info doesn't cover. Primary "Mark as handled", secondary "Copy reply".
  - **Sent:** one `--gray-50` line with the check icon, "Sent · 2:14 PM".
- **Context panel:** flat cards, 16px padding, meta-style headings, in this order: Customer (who is this), Lead (Wants / Contact, "Saved" chip, "View in Leads"), Activity (a few plain lines with times).
- **Calendar (Posts):** flat card, 7 columns Sunday first, 92px cells with 1px `--gray-100` dividers, the day number in meta style (today = violet circle). Post chips: 12px text, 8px radius, icon + text: published = `--gray-50` with a success check; scheduled = white with a `--gray-200` border and a clock; needs a new time = amber-soft with an amber border. A day picked for a new post = `--lavender` cell with a dashed violet "New post" chip. A legend under the grid.
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

Rules for every page (screen design v2):

1. **Use the width.** Content sits left-aligned next to the sidebar and grows to ~1440px (32px side padding, 16px on phones). No narrow centered column with empty margins.
2. **One header row per page:** title on the left, the page's one primary action or its filters on the same row. The work starts high on the screen.
3. **Work pages are list → detail → context:** list on the left, the thing you act on in the middle, supporting facts on the right. Same in Inbox, Leads and Business info, so owners learn it once. Selection lives in the URL (`?item=`, `?lead=`, `?topic=`) so links land on the right thing.
4. **Supporting facts go in the right panel,** never stacked under the main card.
5. **Owners see outcomes, not machinery** (§1.5).
6. **No dead-end links.** If something needs more room, the page gives it room instead of linking away. `/inbox/items/<id>` (from emails and notifications) redirects into the inbox with the item selected.

- App shell: white sidebar (224px) with `[Brand]` wordmark (Bricolage 24/800) + violet dot logo placeholder and the bell; main area on `--gray-25`.
- Responsive: the sidebar stacks on phone widths; three-pane pages become list → detail (a "← All messages" link back), and the context panel moves under the detail below `xl`.

Screens:

- **Inbox:** header = title + tabs (To approve / Needs you / Sent, with counts). List (320px, oldest waiting first) | conversation with the footer for the tab (§3) | context panel (300px).
- **Leads:** header = title + tabs (All / Not replied yet). A table (Name, Wants, Contact, From, Status "Reply waiting for you" / "Replied" with an icon, Received) | the selected lead: contact with coral "Copy number" + "Call", Wants, Latest message, primary "Open in inbox".
- **Posts:** header = title, previous / month / next, Today, and a Month / List switch at right. A month calendar (§3) with one amber line above it for posts that need a new time ("Pick a new time" opens the post) | the composer, always visible: text, a dashed 64px "Add photo" box, accounts, Now / Schedule with Day and Time, and a button that says what will happen ("Schedule for Sun 7:00 AM"). Click a day to plan a post for it. A clicked post opens above the composer with its actions.
- **Business info:** header = title + subtitle + primary "Add a topic". Topic list with "Find a topic" and "Used in N replies this week" | one topic in the editor (Topic, What customers should be told, Save, "Last changed …", "Delete topic") | "Questions your info didn't answer" with "Add an answer" (opens a new topic prefilled with the question).
- **Settings:** a section list (Accounts with "N connected", Replies, Notifications, Business) and one section at a time. Replies: one full-width row per kind of message with a plain sentence and the segmented control; the fixed kinds read "Always you" / "Hidden" instead of a disabled control.
- **Notification panel:** unchanged (§5).
