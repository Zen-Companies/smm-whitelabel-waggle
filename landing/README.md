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
