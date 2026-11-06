# Waggle marketing site

The public site for gowaggle.ai. It is a standalone Next.js app with its own dependencies and brand
styles. It shares no code with the product app in the repo root, and the root lint, typecheck and
Tailwind scan all skip this folder.

```bash
npm install
npm run dev
```

## Deploying

Deploy as its own Vercel project with **Root Directory** set to `landing`. The repo's CI/CD workflow
only deploys the product app, so nothing here ships until that project exists.

Set `NEXT_PUBLIC_APP_URL` to the app's origin. "Start free" and "Log in" link to it, and without it
they resolve to `/signup` and the login path on this site, which do not exist here.

## Logged-in prototype

A clickable design prototype of the logged-in system lives in `app/(system)`, with `app/login` and
`app/signup` as its entry pages. Run `npm run dev` and open `/today`. It uses sample data held in
memory, with no real accounts, and resets on reload.

It is here for review, to be ported to the product app. Remove these routes before this site goes live,
or they will be public on gowaggle.ai.
