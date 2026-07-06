# OpenStrat Web

First web shell for OpenStrat. The CLI/packages remain intact; this app adds a
Privy-authenticated dashboard, strategy request capture, Supabase-backed user
profiles, and a deterministic OpenStrat package API route.

## Environment

Use the root `.env.example` contract.

Required for local auth and persistence:

```env
PRIVY_APP_ID=
PRIVY_APP_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Use `PRIVY_APP_ID` for the dashboard's `privy_app_id` value and
`PRIVY_APP_SECRET` for `privy_app_secret`. `PRIVY_APP_ID` is public-safe and
the server layout passes it to `<PrivyProvider>`.

`NEXT_PUBLIC_PRIVY_CLIENT_ID` is optional unless a Privy App Client exists.
`SUPABASE_URL` is optional and should match `NEXT_PUBLIC_SUPABASE_URL` if set.
`DATABASE_URL` is optional and not used by this first pass.

Server routes verify the Privy bearer access token with `@privy-io/node`, fetch
the Privy user by verified DID, then persist linked wallet/email server-side.
Privy identity tokens may also be sent when enabled in the dashboard, but they
are not required for the standard login path.

## Supabase Schema

Review `apps/web/supabase/openstrat_web.sql` before applying it. It creates:

- `public.openstrat_profiles`
- `public.openstrat_strategies`

RLS is enabled and browser roles are revoked. The app reads/writes these tables
only from server routes using `SUPABASE_SECRET_KEY`.

No migration has been applied automatically.

## Local Run

```bash
pnpm install
pnpm dev:web
```

Then open `http://localhost:3000`.

For a production-style local smoke:

```bash
pnpm --filter @openstrat/web build
PORT=3100 HOSTNAME=127.0.0.1 pnpm --filter @openstrat/web start
```

## Validation

```bash
pnpm --filter @openstrat/web typecheck
pnpm --filter @openstrat/web build
pnpm test
pnpm typecheck
```

## Deployment

The app is configured with `output: "standalone"` for container or VM deploys.
Set the same env vars in the deploy target. Do not deploy with missing Privy or
Supabase secrets.

See `apps/web/DEPLOYMENT.md` for the Fly/Docker path.
