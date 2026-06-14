# Database

PostgreSQL on **Neon** (serverless), accessed with **Drizzle ORM**. The schema is the
single source of truth in `shared/schema.ts` and is shared between frontend and backend.

## Connection

- `server/db.ts` connects with `@neondatabase/serverless` over WebSockets, using the
  `DATABASE_URL` environment variable.
- Neon pools through **PgBouncer in transaction mode**, so session-level `SET` does not
  persist across queries. Tenant scoping therefore uses transaction-local
  `set_config('app.location_id', <id>, true)` — see [PERMISSIONS](PERMISSIONS.md).

## Schema (`shared/schema.ts`)

Tables are declared with Drizzle's `pgTable`. For each model the file also exports:

- a `createInsertSchema(...)` Zod schema (with auto-generated fields `.omit`ted),
- the insert type (`z.infer<typeof insertXSchema>`),
- the select type (`typeof table.$inferSelect`).

Major table groups:

- **Core / tenancy:** `users`, `locations` (the `ownerId` on a location anchors
  multi-tenancy).
- **Inventory & recipes:** `inventory_items`, `categories`, `vendors`,
  `vendor_price_catalog`, `recipes`, `recipe_ingredients`, `menu_items`.
- **Operations:** `purchase_orders`, `purchase_order_items`, `waste_entries`,
  `inventory_transactions`, sales tables.
- **POS:** `pos_integrations`, `pos_event_queue`, `pos_sales`, `pos_employees`,
  `pos_employee_mappings`, `pos_timeclocks`, mapping tables.
- **HR / payroll:** `employees`, `shifts`, `time_entries`, pay period / paycheck /
  paystub tables, `onboarding_tokens`, `employee_onboarding_data`,
  `employee_documents`, `employee_signatures`.
- **Billing / system:** subscription fields on `users`, `invoice_processing`,
  `audit_logs`, `security_logs`, `cost_alerts`, `budgets`.

### Encrypted columns

On `employee_onboarding_data`, the columns `social_security_number`, `account_number`,
and `routing_number` are **`text`** and store **AES-256-GCM ciphertext**, not plaintext.
Encryption/decryption is centralized in `server/encryption.ts` and applied in the
storage layer. Never read these columns without decrypting, and never store plaintext
into them. Full details and rules: `.agents/memory/pii-encryption.md`.

## Storage layer (`server/storage.ts`)

All database access goes through the `IStorage` interface, implemented by the
`DatabaseStorage` class. Routes call methods like `getInventoryItems()`,
`saveEmployeeOnboardingData()`, or `checkOcrAccess()` and never issue raw SQL
themselves. When you add a table or query, add a typed method here.

## Migrations (two files, keep them in sync)

This project uses **idempotent, hand-written migrations** rather than auto-applied
Drizzle diffs, so the same statements can run safely on every boot/deploy.

| File | Runs | When |
|------|------|------|
| `server/startup-migrations.ts` | Dev (and on every server start via `tsx`) | At boot, before routes register |
| `scripts/migrate.mjs` | Production | Before `npm start` on deploy |

> ⚠️ **Every schema change must be added to BOTH files**, with identical SQL. They are
> intentional mirrors; drift between them causes "column does not exist" errors in one
> environment but not the other.

Rules:

- Statements must be idempotent: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT
  EXISTS`, `CREATE INDEX IF NOT EXISTS`, or `ALTER COLUMN ... TYPE ...` (re-running a
  no-op type change is safe).
- **Append** new entries at the bottom; never remove or reorder existing ones.
- `drizzle.config.ts` exists for generating SQL snapshots in `migrations/`, but the
  runtime path is the two idempotent files above. **Do not edit `drizzle.config.ts`.**

## Local/SQL access

Use the Replit database tooling for read-only queries. For production data, query the
production database explicitly (see the `database` skill). Be cautious: production is a
separate Neon database from development.
