# Deployment

The app is built as one Express server that serves both the API and the built React
frontend. Production runs on **Railway** (Nixpacks builder, no Dockerfile) and is served
at **restroflowsolutions.com**. The development environment runs on Replit.

## Runtime shape

- **Dev:** `npm run dev` → `NODE_ENV=development tsx server/index.ts`. Express serves the
  API and Vite provides the frontend with HMR. Listens on port **5000**.
- **Prod:** the frontend is built to static assets and served by Express
  (`serveStatic`); migrations run before the server starts.

> ⚠️ Do not modify `server/vite.ts`, `vite.config.ts`, or the `package.json` scripts —
> the single-port FE/BE serving is already wired. Use the package-management tooling to
> add dependencies rather than editing `package.json` by hand.

## Database migrations on deploy

`scripts/migrate.mjs` runs **before** the server starts in production and applies the
same idempotent SQL as `server/startup-migrations.ts` (which runs on dev startup).
**Both files must be kept in sync** — see [DATABASE](DATABASE.md). After any merge that
changes the schema, confirm both files contain the new statement.

## Railway specifics (build gotchas)

These were hard-won; keep them:

- **Builder:** Nixpacks (no Dockerfile).
- **Install:** `npm install` must run with `--cache /tmp/npm-cache` to avoid an npm
  crash in the Railway build sandbox.
- **Dev dependencies are needed at build time** (e.g. `tsx`, Vite), so install with
  `NODE_ENV=development` and reference binaries via explicit `.bin` paths where needed.
- **Keep `uv.lock` deleted** — its presence triggers an unwanted Python build path.
- **npm registry:** the Replit environment forces a package firewall via an env var, so
  installs use the `--registry=https://registry.npmjs.org/` CLI flag rather than relying
  on `.npmrc` alone. (Detail: `.agents/memory/npm-registry-override.md`.)

## Environment variables & secrets

Set these in **both** Replit (dev) and Railway (prod). Values must be environment-
appropriate (see notes).

| Secret | Purpose | Notes |
|--------|---------|-------|
| `DATABASE_URL` | Neon Postgres connection | Separate DB per environment |
| `CLERK_SECRET_KEY` | Clerk server auth | **Live** in prod, **test** in dev |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk client auth | Live PK is domain-locked to restroflowsolutions.com — use a test PK in dev. See [AUTH](AUTH.md) |
| `PII_ENCRYPTION_KEY` | Encrypts SSN/bank PII at rest | **Required.** Use the **same value** in dev and prod if data ever moves between them; changing it makes existing ciphertext unreadable. See [DATABASE](DATABASE.md) |
| `FIREBASE_SERVICE_ACCOUNT_JSON`, `VITE_FIREBASE_*` | Firebase | |
| `SENDGRID_API_KEY` | Transactional email | |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_APPLICATION_ID`, `SQUARE_ENVIRONMENT`, `SQUARE_WEBHOOK_SIGNATURE_KEY` | Billing | Absent → billing disabled (app still runs). See [BILLING](BILLING.md) |
| AWS credentials | Object storage + Textract OCR | OCR degrades gracefully if missing. See [OCR](OCR.md) |
| `SENTRY_DSN` | Error monitoring | Optional; disabled if unset |
| `ENABLE_SCHEDULERS` | Background POS/analytics jobs | `true` to enable; off by default |

> Manage secrets through the platform's secret tooling — never commit them or paste
> values into code. After adding/rotating a secret, restart the workflow so it loads.

## Startup self-checks

On boot the server logs diagnostics you can use to confirm a healthy deploy:

```
🔐 [Clerk] frontend instance="clerk.restroflowsolutions.com" publishableKey=live secretKey=live
🔐 [Encryption] PII_ENCRYPTION_KEY configured — SSN & bank data encrypted at rest.
🔄 Running N startup migration(s)...  ✅ ...
[express] serving on port 5000
```

Warnings to watch for: a Clerk key **mismatch** (causes 401s), `PII_ENCRYPTION_KEY is
NOT set` (PII writes will fail), or a failed migration (boot aborts).

## Post-deploy verification

1. Confirm the boot log shows correct Clerk keys, encryption configured, and all
   migrations green.
2. Log in on the live domain and load the dashboard.
3. If the published app misbehaves, check the production logs (deployment skill) before
   changing code.

## Production debugging

When prod is broken but dev is fine, start with **production logs** and the **production
database** (read-only), per the `deployment` and `database` skills. Common causes:
missing/rotated secrets, a schema statement present in one migration file but not the
other, or live-vs-test Clerk key issues.
