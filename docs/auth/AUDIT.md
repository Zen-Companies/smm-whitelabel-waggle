# Sign-in audit (2026-11-12)

Before the 14 platforms, sign-in gets solid. This lists what exists, what's missing, and what we
add, using the standard patterns most SaaS apps use (Google + email/password, one login per email).
Designs: v3 canvas, row "Sign-in and account".

## What exists

| Area | Today |
|---|---|
| Sign up | Name, email, password (app asks 10+). Makes the personal organization (T54). |
| Sign in | Email + password only. "Wrong email or password." |
| Email confirmation | `/auth/confirm` verifies the link, then `/welcome`. Off locally; production setting not confirmed. |
| Invite join | Sign up with the invited email locked, or "Sign in to join" (T56). |
| AI assistant consent | `/oauth/consent` sends signed-out users to `/login?next=…` and back. |
| Sign out | Top bar icon; also a button oddly placed in Settings → Business. |
| Sessions | Supabase cookies, refreshed by the proxy. |

## Gaps

1. **No Google sign-in.**
2. **No "Forgot password?"** and no page to choose a new password (a reset email has nowhere to land).
3. **No account page**: name, email, password and sign-out live nowhere sensible; nothing per login (only per brand / per organization).
4. **Password rules disagree**: the app asks 10+, Supabase accepts 6 (`minimum_password_length = 6`), so a reset or a direct API call can set a 6-character password.
5. **No "Sign out everywhere"** and no way to delete a login (the last-owner rule from T53 has no screen to apply to).
6. **Changing email** isn't possible.
7. **Supabase emails** (confirm, reset) use Supabase's sender and plain templates until custom SMTP is set (Resend, `noreply@mail.gowaggle.ai`).

## What we add (standard behavior, nothing invented)

- **"Continue with Google"** on login, sign-up, the invite page and the AI-assistant sign-in. Supabase OAuth (PKCE), callback `/auth/callback`.
- **One login per email.** Google with an email that already has a password login signs into that same login (Supabase links identities with the same verified email). A new email creates a login + personal organization, name from Google, then `/welcome`.
- **Forgot password**: email → the same "check your email" message whether or not the email exists (no account probing) → link → "Choose a new password" → signed in. Expired link has its own page.
- **Settings → Account** (per login, top of Settings): name; email (change sends a confirmation to the new address); sign-in methods: Google (connected / connect), Password (Change password, or "Add a password" for a Google-only login; reset link from there too); Sign out everywhere; Delete login (blocked while you're the last Owner of an organization with other members or brands).
- **Invites with Google**: "Continue with Google" on the invite page; a Google account with another email gets the existing "This invite is for another email" page, with "Use another Google account".
- **Password rule 10+ everywhere** (Supabase setting raised to 10).

## Setup outside the code (when building)

- Google Cloud: OAuth client (Web), authorized redirect `https://<supabase-project>.supabase.co/auth/v1/callback`; consent screen with Waggle's name, logo, privacy and terms links (gowaggle.ai).
- Supabase: enable the Google provider with that client id/secret; add `https://waggle-wheat.vercel.app/auth/callback` (and localhost) to redirect URLs; password minimum 10; custom SMTP (Resend); Waggle email templates.

## Codebase check before building (2026-11-12)

What the build touches, and what it changes:

- **Sign-in paths**: `signUp`/`signIn`/`signOut` (features/tenants/actions.ts), `/auth/confirm`, invite join actions (features/orgs/join-actions.ts), MCP consent (`/login?next=`), `signInNext` (consent + invite only). Google adds `/auth/callback` (PKCE code exchange with the cookie client) and the same `next` rules; reset adds `/auth/reset` and a `recovery` branch in `/auth/confirm`.
- **Session**: refreshed by `src/proxy.ts` on every page; authorization stays in pages and actions. Unchanged.
- **Where the beta gate goes**: the gate lives in the layouts that already require a login (dashboard, `(setup)`, `/brands/*`) and in the actions that create things without a brand (`createOrganization`, `addBrand`), plus the MCP consent page. Left open: landing, `/login`, `/signup`, `/invite/*`, `/auth/*`, the gate page itself, webhooks, jobs, `/api/mcp` (its own OAuth checks). Staff logins are recorded as beta ("existing") and never gated.
- **Account page**: Settings is brand-scoped (dashboard) and `/orgs/settings` serves brandless logins; Account goes in both navs. Sign out leaves Settings → Business.
- **Switches**: `feature_flags` (global rows) and Staff → Switches already exist; "Beta code required" is a new global key `beta.required`.
- **Staff pages**: `STAFF_PAGES` + permission matrix; Beta codes is a new page behind a new `beta.manage` permission (admins).
- **Mail**: `src/lib/email` (Resend, Mailpit locally) for nothing new here; Supabase sends confirm and reset emails itself (custom SMTP).
- **GHL**: new `FEEDBACK_WEBHOOK_URL`, posted server-side like gowaggle's waitlist route.

### Finding that matters before Google goes live

- **Email confirmation must be on in production.** Google sign-in joins an existing login with the same email. If sign-ups aren't confirmed, someone could register another person's email with a password first, and that person's later Google sign-in would land in the stranger's login. Turning confirmation on (Supabase → Authentication → Sign In / Providers → Email → Confirm email) closes it; the app already handles "Check your email to confirm".
- **Deleting a login** leaves its personal organization behind (personal_of becomes null). Delete login removes the personal organization when it has no brands and no other members, and offboards it (3-month restore) when it has brands.
