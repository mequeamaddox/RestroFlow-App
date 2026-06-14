---
name: startup migrations
description: Two migration files must stay in sync — one for dev, one for prod
---

## The rule
This project has two parallel migration files that must always be updated together:

1. `server/startup-migrations.ts` — runs on every `tsx server/index.ts` start (development). Uses Drizzle's `db.execute(sql.raw(...))`.
2. `scripts/migrate.mjs` — runs in production before `npm start` via `node scripts/migrate.mjs && npm run start`. Uses the bare `@neondatabase/serverless` neon client.

**Why:** Dev server does not run `scripts/migrate.mjs` (that's prod-only). If you only update one file, the database schema diverges between environments.

**How to apply:** Any time you add a new column or table to `shared/schema.ts`, add the same idempotent SQL to BOTH files at the bottom. Never remove or reorder existing entries.
