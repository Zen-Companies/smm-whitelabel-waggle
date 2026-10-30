# Waggle

AI that runs your socials. Local businesses publish posts, and Waggle handles their Instagram and Facebook comments and DMs: it sorts each message, drafts a reply from the business's own info, and the owner approves it.

- What we're building: `docs/prd.md` · how it's built: `docs/tdd.md` · tasks: `docs/tasks.md` · design: `docs/design.md` · rules: `CLAUDE.md`
- Demo walkthrough: `docs/demo-script.md`

All commands run from the project folder, in PowerShell.

## First-time setup

```powershell
pnpm install
Copy-Item .env.example .env.local   # then fill it in (see "Environment" below)
supabase start                      # local Supabase; prints the keys for .env.local
```

## Every day

```powershell
supabase start        # local database (ports 553xx)
pnpm dev              # the app at http://localhost:3000 (also runs the job queue via pg_cron)
```

Stop with Ctrl+C (app) and `supabase stop` (database; data is kept).

| Local page | URL |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio (browse tables) | http://127.0.0.1:55323 |
| Test emails (Inbucket) | http://127.0.0.1:55324 |
| Admin lab and Costs (admin role) | http://localhost:3000/admin/lab, /admin/costs |

## Signing in

```powershell
pnpm local:owner --email test-email@test.com                 # one-time sign-in link (1 hour)
pnpm local:owner --email you@example.com --tenant <uuid>     # attach a login to an existing business
```

The link uses `APP_URL`. If `APP_URL` is your ngrok address, swap it for `http://localhost:3000` before opening the link.

Demo login: **owner@example.com** / **password123** (Harbour Bean Café, after `pnpm demo:seed`).

Admin pages need the admin role on a login (nobody has it by default):

```powershell
pnpm local:operator --email you@example.com            # make a login an admin
pnpm local:operator --email you@example.com --remove   # take it away
```

## Demo (no real calls)

```powershell
# .env.local: SOCIAL_PROVIDER_MODE=mock
pnpm demo:seed        # refills Harbour Bean Café; run again between rehearsals
```

Then follow `docs/demo-script.md`.

## Live test (real Instagram, local app)

1. Remove `SOCIAL_PROVIDER_MODE=mock` from `.env.local`.
2. Start local Jev so sorting is free:
   ```powershell
   cd "C:\Users\Febron Sedoriosa\tools\jev"; .\jev.exe serve    # http://127.0.0.1:8017, ~1 GB RAM
   ```
3. Expose the app to Zernio's webhooks:
   ```powershell
   ngrok http 3000
   ```
   Set `APP_URL=<ngrok url>` in `.env.local` and restart `pnpm dev`. In the Zernio dashboard, point the webhook to `<ngrok url>/api/webhooks/zernio` with the same secret as `ZERNIO_WEBHOOK_SECRET`.
4. Use the app at `http://localhost:3000` (webhooks still come in through ngrok).
5. When done: put `SOCIAL_PROVIDER_MODE=mock` back and stop ngrok.

Free OpenRouter models allow about 50 requests a day. Each Business info topic saved is 1 request, and each incoming message about 2 (3 without jevos).

## Checks

```powershell
pnpm typecheck          # types (stop pnpm dev first: it can put the dev server in a reload loop)
pnpm lint
pnpm test               # unit tests (mocked, no real calls)
pnpm test:integration   # against local Supabase (needs supabase start)
pnpm test:db            # RLS tests in supabase/tests
pnpm build              # production build (PowerShell; Git Bash fails on Windows)
pnpm format             # Prettier
```

## Database

```powershell
supabase migration new <name>          # new migration file in supabase/migrations
supabase migration up --local          # apply new migrations, keeps data
pnpm gen:types                         # regenerate database types after a migration
supabase status                        # ports and keys
docker exec supabase_db_zernio-new-project psql -U postgres   # SQL shell
```

`supabase db reset` **wipes all local data**. Don't run it unless you mean to (CLAUDE.md rule 13).

## AI tools

```powershell
pnpm triage:report                     # labeled messages through each classifier (local/free ones only)
pnpm triage:report --only jev          # just local Jev
pnpm draft:preview --text "Do you have wifi?" --kind dm   # one draft from the demo business info (uses OpenRouter)
```

Classifiers and drafts that call OpenRouter only run when named, to avoid using up the free requests.

## Troubleshooting

| Problem | Fix |
|---|---|
| `supabase start` fails on ports 553xx ("bind: access forbidden"), usually after a reboot | Admin PowerShell: `net stop winnat; net start winnat`, then `supabase start` |
| The page keeps reloading and the terminal shows `✓ Compiled in 1ms` over and over | Ctrl+C, `Remove-Item -Recurse -Force .next\dev`, `pnpm dev` |
| Sign-in link gives `ERR_SSL_PROTOCOL_ERROR` on localhost | Open the link with `http://localhost:3000` instead of the ngrok address |
| Zernio webhook deliveries return 400 | The endpoint's secret in Zernio doesn't match `ZERNIO_WEBHOOK_SECRET` |
| New messages aren't sorted, or the free daily limit runs out fast | Start jevos (see Live test, step 2) |
| Business info topic stays "getting ready…" | The embedding call failed or the free limit ran out; check the `pnpm dev` terminal |

## Environment

Copy `.env.example` to `.env.local`; every variable is explained there. The main ones:

| Variable | What it's for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Local database (from `supabase start`) |
| `APP_URL` | Where links point: `http://localhost:3000`, or the ngrok URL during a live test |
| `SOCIAL_PROVIDER_MODE=mock` | No Zernio calls (demo and smoke tests) |
| `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET` | Zernio (live only) |
| `JEV_API_URL` | Local jevos: `http://127.0.0.1:8017/v1/systemone` |
| `OPENROUTER_API_KEY`, `LLM_*_MODEL`, `EMBEDDING_MODEL` | Drafting and embeddings (free `:free` models for now) |
| `CRON_SECRET` | Job queue; locally `local-dev-cron-secret` |
