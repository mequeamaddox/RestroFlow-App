/**
 * Production database migration script — runs as Railway's releaseCommand before each deploy.
 * Uses only production dependencies (@neondatabase/serverless).
 * Every statement is idempotent — safe to run on every deploy.
 *
 * HOW TO ADD A SCHEMA CHANGE:
 *   1. Update shared/schema.ts with the new table/column.
 *   2. Add an idempotent SQL entry at the bottom of the `migrations` array below.
 *      Use ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, etc.
 *   3. Commit both files together.
 *
 * Never remove or reorder existing entries — they serve as a permanent audit trail.
 * For local dev schema sync: npm run db:push (drizzle-kit push without --force).
 */

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const migrations = [
  {
    name: "categories.location_id",
    sql: `ALTER TABLE categories ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE CASCADE`,
  },
  {
    name: "locations.owner_id",
    sql: `ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner_id varchar`,
  },
  {
    name: "pos_integrations.last_webhook_at",
    sql: `ALTER TABLE pos_integrations ADD COLUMN IF NOT EXISTS last_webhook_at timestamp`,
  },
  {
    name: "pos_event_queue table",
    sql: `CREATE TABLE IF NOT EXISTS pos_event_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id uuid NOT NULL REFERENCES pos_integrations(id),
      provider varchar NOT NULL,
      event_type varchar NOT NULL,
      source varchar NOT NULL,
      idempotency_key varchar UNIQUE,
      payload jsonb NOT NULL,
      status varchar NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      process_after timestamp DEFAULT now(),
      processed_at timestamp,
      created_at timestamp DEFAULT now()
    )`,
  },
  {
    name: "pos_event_queue.status_idx",
    sql: `CREATE INDEX IF NOT EXISTS pos_event_queue_status_idx ON pos_event_queue (status, process_after) WHERE status IN ('pending','failed')`,
  },
  {
    name: "employee_onboarding_data.social_security_number -> text",
    sql: `ALTER TABLE employee_onboarding_data ALTER COLUMN social_security_number TYPE text`,
  },
  {
    name: "employee_onboarding_data.account_number -> text",
    sql: `ALTER TABLE employee_onboarding_data ALTER COLUMN account_number TYPE text`,
  },
  {
    name: "employee_onboarding_data.routing_number -> text",
    sql: `ALTER TABLE employee_onboarding_data ALTER COLUMN routing_number TYPE text`,
  },
  {
    name: "subscription_plan enum: professional -> core",
    sql: `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'professional' AND enumtypid = 'subscription_plan'::regtype) THEN ALTER TYPE subscription_plan RENAME VALUE 'professional' TO 'core'; END IF; END $$`,
  },
  {
    name: "platform_settings table",
    sql: `CREATE TABLE IF NOT EXISTS platform_settings (
      key varchar(100) PRIMARY KEY,
      value text,
      description text,
      updated_at timestamp DEFAULT now(),
      updated_by varchar
    )`,
  },
  {
    name: "document_templates.location_id",
    sql: `ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE CASCADE`,
  },
  {
    name: "audit_logs.actor_email",
    sql: `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_email varchar(320)`,
  },
  {
    name: "audit_logs.ip_address",
    sql: `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address varchar(45)`,
  },
  {
    name: "audit_logs.user_agent",
    sql: `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent text`,
  },
  {
    name: "pos_provider enum: add square",
    sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'square' AND enumtypid = 'pos_provider'::regtype) THEN ALTER TYPE pos_provider ADD VALUE 'square'; END IF; END $$`,
  },
  {
    name: "pos_provider enum: add lightspeed",
    sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'lightspeed' AND enumtypid = 'pos_provider'::regtype) THEN ALTER TYPE pos_provider ADD VALUE 'lightspeed'; END IF; END $$`,
  },
];

async function run() {
  console.log(`🔄 Running ${migrations.length} migration(s)...`);
  for (const m of migrations) {
    try {
      await sql(m.sql);
      console.log(`  ✅ ${m.name}`);
    } catch (err) {
      console.error(`  ❌ ${m.name}: ${err.message}`);
      process.exit(1);
    }
  }
  console.log("✅ All migrations complete.");
}

run();
