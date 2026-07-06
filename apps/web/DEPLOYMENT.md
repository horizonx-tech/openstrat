# OpenStrat Web Deployment

This first web shell is configured for a single always-on Fly Machine using
`Dockerfile.web` and `fly.toml` from the repository root.

## Prerequisites

- Apply `apps/web/supabase/openstrat_web.sql` only after reviewing it.
- Confirm `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are from the same Privy app.
  Identity tokens are optional; the deployed app verifies Privy bearer access
  tokens and fetches the user record server-side.
- Authenticate Fly locally with `flyctl auth login`.
- Confirm or change the Fly app name in `fly.toml`.

## Secrets

Set secrets in Fly. Do not commit them.

```bash
flyctl secrets set \
  PRIVY_APP_ID=... \
  PRIVY_APP_SECRET=... \
  NEXT_PUBLIC_SUPABASE_URL=... \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
  SUPABASE_SECRET_KEY=... \
  SUPABASE_URL=...
```

`SUPABASE_URL` should match `NEXT_PUBLIC_SUPABASE_URL`. `DATABASE_URL` is not
required for this app because it uses Supabase client APIs rather than direct
Postgres connections.

`NEXT_PUBLIC_*` values are public, but Next.js bakes them into the client bundle
during `next build`. `PRIVY_APP_ID` is also public-safe and is passed from the
server layout into the Privy client. When deploying with Docker, pass these
public values as build args as well as runtime env/secrets.

## Deploy

```bash
flyctl launch --no-deploy --copy-config --name openstrat-web --no-db --no-redis --no-object-storage --no-github-workflow --ha=false
flyctl deploy \
  --build-arg NEXT_PUBLIC_APP_URL=https://openstrat-web.fly.dev \
  --build-arg PRIVY_APP_ID=... \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
flyctl status
flyctl open
```

The app is intentionally configured with one running Machine because it is a
first always-on shell, not the managed agent runtime yet.
