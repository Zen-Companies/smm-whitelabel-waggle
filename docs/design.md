# Design system: Waggle

Status: v2 (replaces the Friendly Local v1 spec) · Source: "Waggle brand mockups" canvas.

**Waggle** is the product name. Tagline: **AI that runs your socials.** Headline line: **Your socials, handled.**

The story: bees dance a figure-8 (the waggle dance) to tell the hive where the good flowers are. Waggle does the same for a business's page: it finds the comments that are real customers and tells the owner.

The app is **dark-first** ("the hive"): warm near-black surfaces, wax-colored text, and honey for the things that matter. Marketing surfaces can use the light wax variant.

## 1. Principles

1. **Honey means "this matters".** The primary action, hot leads, items that need the owner, the Today summary. If it doesn't matter right now, it's not honey.
2. **Calm hive, bright signal.** Dark, quiet, warm surfaces so the honey signal stands out. No gradients except the subtle radial glow behind the logo on marketing pages.
3. **Feedback on the thing.** No toasts, ever. What you act on changes in place; errors stay where they happened.
4. **Confident and short.** "You run the shop. We'll run the comments." Plain words, one idea per line.

## 2. Logo

Files in `public/brand/`:

| File | Use |
|---|---|
| `waggle-mark-dark.svg` | Mark on dark (honey trail + bee) |
| `waggle-mark-light.svg` | Mark on light (hive trail + honey bee) |
| `waggle-mark-small.svg` | Trail only, for sizes under 48px (the bee drops) |
| `waggle-app-icon.svg` | App icon / favicon source (dark rounded square) |

- Wordmark: `waggle` in **Outfit 700**, lowercase, letter-spacing -0.035em, followed by a **honey full stop** (`#F6B21B` on dark, `#C98500` on light). Always lowercase. Build it as text, not an image: `waggle<span class="text-honey">.</span>`.
- In the app sidebar: small trail mark (no bee) + wordmark at 22–24px.
- Never recolor the mark outside honey / hive / wax, stretch it, or add effects.

## 3. Tokens

Put these in `src/app/globals.css` as CSS variables, map them in Tailwind/shadcn, and use tokens only (no raw hex in components).

### Color (dark app theme, default)

| Token | Hex | Use |
|---|---|---|
| `--hive` | `#17140F` | app background |
| `--hive-raised` | `#221D15` | cards, sidebar, panels, inputs |
| `--hive-high` | `#2A2318` | hover, selected row, menus |
| `--line` | `#2E2719` | subtle borders, dividers |
| `--line-strong` | `#3A3122` | input and secondary button borders, chip outlines |
| `--wax` | `#FFF6E6` | primary text, icons |
| `--wax-muted` | `#D9CCB0` | secondary text, quoted customer messages |
| `--pollen` | `#B9A988` | meta, labels, captions (uppercase labels) |
| `--honey` | `#F6B21B` | primary action, Today card, needs-you border, unread dot, bell count. Text on honey is always `--hive` |
| `--honey-light` | `#FFD266` | "Hot lead" label text, link hover |
| `--honey-deep` | `#C98500` | honey on light backgrounds (full stop, links) |
| `--alert` | `#FF9B85` | complaint label text and icon |
| `--danger` | `#FF7A66` | inline errors (box bg `#2C1915`, border `#5C2B22`) |
| `--success` | `#8FD19E` | sent/answered check (bg `#1C2A1F`) |
| `--banner-bg` | `#33270F` | account-wide banner (border `#6B4E1A`, text `--wax`, icon `--honey`) |

### Color (light variant: marketing, emails, auth pages if desired)

`--wax` `#FFF6E6` page · `--parchment` `#EFE6D2` sections · `--hive` text · `--ink-soft` `#5E513A` secondary text · `--honey` accents, `--honey-deep` for honey text/links on light.

All text pairs must meet WCAG AA (4.5:1). Never put wax or white text on honey; use hive.

### Type

**Outfit** (Google Fonts, 400/500/600/700) for everything: one family, like the mockups.

| Role | Size / weight |
|---|---|
| Marketing display | 64–150 / 700, letter-spacing -0.035em |
| Page title | 28–32 / 700, -0.02em |
| Card headline / big numbers | 24–30 / 700 |
| Section | 18 / 600 |
| Body | 16–17 / 400, line-height 1.35–1.5 |
| Button | 15 / 600 (secondary 500) |
| Label (uppercase meta) | 13 / 600, letter-spacing 0.12em, `--pollen`, e.g. `INSTAGRAM · @marco.eats` |
| Small meta | 12–13 / 500, tabular numbers |

### Shape, spacing, depth

- Radius: `12` buttons and inputs · `14` icon buttons · `18` cards and list items · `22` summary card, panels · `28` large marketing panels · `full` filter chips and avatars.
- Spacing: 4 / 8 / 10 / 14 / 18 / 20 / 24 / 32 / 48 / 64.
- Depth on dark: borders do the work (`--line` / `--line-strong`); raised surfaces are lighter (`--hive-raised`, `--hive-high`). Shadows only on overlays: `0 16px 40px rgba(0,0,0,.45)`.
- Motion: 150–200ms ease-out. Signature moment: when a reply is sent, a tiny honey trail traces a figure-8 once next to the check (respect `prefers-reduced-motion`). No motion on complaints, billing or errors.

## 4. Components

- **Buttons:** Primary = honey bg, hive text, 12px radius, 44px tall, 600. Secondary = transparent, 1px `--line-strong`, wax text. Quiet = text only, `--wax-muted`. Destructive = text only, `--danger`. Min height 44px.
- **Filter chips** (inbox tabs): pills, 44px. Active = wax bg + hive text. Inactive = transparent, `--line-strong` border, `--wax-muted` text.
- **Inputs:** `--hive-raised` bg, 1px `--line-strong`, 12px radius, 44px; focus = honey border + 3px `rgba(246,178,27,.25)` ring. Errors: danger text under the field. Real `<label>` always.
- **Segmented control** (autonomy: Off / Ask me first / Auto-reply): `--hive-raised` track, 12px radius; active segment `--hive-high` with `--line-strong` border.
- **Today summary card** (top of inbox): honey bg, hive text, 22px radius. Label `TODAY` (13/700, 0.12em). Three big numbers: **answered** (sent), **for you** (needs approval or escalated), **ignored** (spam).
- **Inbox tabs:** **For you** (awaiting approval + escalated + failed) · **Answered** (sent) · **Ignored** (spam / no reply needed).
- **Inbox item card:** `--hive-raised`, 18px radius, 1px `--line-strong`. Items that need the owner get a **1px honey border**. Header row = uppercase label `PLATFORM · handle` in `--pollen`, status at right (`HOT LEAD` in `--honey-light`, `ANSWERED · 6s` / `IGNORED` in `--pollen`, `COMPLAINT` in `--alert`). Customer message in `--wax-muted` (quoted), Waggle's reply or draft in `--wax`. Actions: primary + secondary buttons side by side, full width on mobile.
- **Approval detail** (desktop right pane): the same card language, larger. Draft in an editable textarea. Footer: primary "Approve and send", secondary "Edit", quiet "Don't reply". Keyboard hints `A` approve, `E` edit, `J` next (keep the shortcuts).
- **Category labels:** status text in the card header, not chips: `HOT LEAD` (honey-light) for leads, `COMPLAINT` (alert) for complaints, plain `QUESTION` / `UNCLEAR` (pollen). Spam goes to Ignored.
- **Next post card** (bottom of inbox / dashboard): `NEXT POST` label, post title, platform count, time in honey.
- **Avatars:** customer's real profile photo; fallback = `--hive-high` circle with a person icon in `--pollen`. Never colored initials.
- **Icons:** lucide-react, 2px stroke, `currentColor`, wax or pollen. Icon buttons 44px, 14px radius, `--hive-raised` + `--line-strong` border.
- **Loading:** skeletons in `--hive-high`, never spinners on lists.

## 5. Feedback without toasts

- **Sending:** primary button shows a small spinner + "Sending", disabled.
- **Sent:** the card collapses to one row: success check, "Answered · 2:14 PM", underlined "Undo" for 8 seconds (current behavior), then it moves to Answered.
- **Couldn't send:** the card stays in For you with a danger box: the reason and the fix ("Copy reply" / "Mark as handled").
- **Account-wide problems** (disconnected account, Zernio paused): one banner at the top of the page (`--banner-bg`, honey icon), stays until fixed, single fix button.
- No toast library anywhere.

## 6. Notification center

Same behavior as before, restyled: bell icon button (44px) with a honey count badge (hive text) for unread items that need action; panel on `--hive-raised`, 22px radius, overlay shadow; title "Notifications" (Outfit 700, 22px); tabs All / For you / Updates; groups Today / Earlier; rows with a 36px circle icon (lead = honey-tinted `#33270F` + honey icon; complaint = `#2C1915` + alert icon; answered summary = `#1C2A1F` + success check; post = `--hive-high` + wax icon); honey unread dot; inline action links in honey. Updates batch ("5 comments answered automatically"); leads, complaints and account problems one per event.

## 7. Spot illustrations

Files in `public/illustrations/` (bee illustrations for the hive): `inbox-clear.svg`, `connect-accounts.svg`, `new-lead.svg`, `reconnect.svg`.

- Style: 2.5px wax outline, round joins, flat fills in honey, honey-light, pollen and hive tones. Each scene pairs a shop object with the Waggle bee (same bee as the logo) and a dotted honey trail echoing the figure-8. No other characters, robots or AI imagery.
- Place on a `--hive-raised` panel, 22px radius, with an Outfit 700 headline (24–28px) and one friendly line.
- Use only in empty states, onboarding, first wins and gentle problems. Never in lists, forms or complaint screens.

| Screen | Illustration |
|---|---|
| Inbox empty (For you clear) | inbox-clear |
| First run / no accounts connected | connect-accounts |
| Leads empty, first lead | new-lead |
| Account disconnected state | reconnect |

## 8. Voice

- Confident, warm, short. The owner runs the shop; Waggle runs the socials.
- Examples: "Your socials, handled." · "You run the shop. We'll run the comments." · "3 customers are ready to buy." · "All caught up. Nothing needs you."
- Plain words: replies, comments, messages, customers, posts. Never "webhook", "LLM", "classifier", "agent".
- Calm and clear for complaints, money and errors; no jokes there.

## 9. Layout

- App shell: `--hive` background; sidebar on `--hive-raised` with small trail mark + `waggle.` wordmark; content max width ~1200px, 24–40px padding. The current business name (e.g. "Bayside Café") shows at the top of the inbox like the mobile mockup.
- Mobile first for the inbox: Today card, filter chips, item cards, next post card at the bottom (matches the phone mockup). Desktop: list + detail panes.
- Screens: Inbox, conversation page, Posts (list, compose, schedule), Leads, Business info, Settings (accounts, autonomy, notifications), login/signup (light or dark), notification panel, admin costs.
- Favicon and app metadata from `waggle-app-icon.svg`; page titles "… · Waggle".
