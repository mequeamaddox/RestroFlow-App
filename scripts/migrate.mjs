/**
 * Production database migration script.
 * Uses only production dependencies (@neondatabase/serverless).
 * Every statement is idempotent — safe to run on every deploy.
 *
 * Add new migrations at the bottom of the `migrations` array.
 * Never remove or reorder existing entries.
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
