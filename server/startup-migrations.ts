import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Idempotent schema migrations that run on every server startup.
 * Safe to run repeatedly — every statement uses IF NOT EXISTS.
 * Add new entries at the bottom; never remove or reorder existing ones.
 */
const migrations: { name: string; sql: string }[] = [
  {
    name: "categories.location_id",
    sql: "ALTER TABLE categories ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE CASCADE",
  },
  {
    name: "locations.owner_id",
    sql: "ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner_id varchar",
  },
  {
    name: "pos_integrations.last_webhook_at",
    sql: "ALTER TABLE pos_integrations ADD COLUMN IF NOT EXISTS last_webhook_at timestamp",
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
    sql: "CREATE INDEX IF NOT EXISTS pos_event_queue_status_idx ON pos_event_queue (status, process_after) WHERE status IN ('pending','failed')",
  },
  {
    name: "employee_onboarding_data.social_security_number -> text",
    sql: "ALTER TABLE employee_onboarding_data ALTER COLUMN social_security_number TYPE text",
  },
  {
    name: "employee_onboarding_data.account_number -> text",
    sql: "ALTER TABLE employee_onboarding_data ALTER COLUMN account_number TYPE text",
  },
  {
    name: "employee_onboarding_data.routing_number -> text",
    sql: "ALTER TABLE employee_onboarding_data ALTER COLUMN routing_number TYPE text",
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
];

export async function runStartupMigrations(): Promise<void> {
  console.log(`🔄 Running ${migrations.length} startup migration(s)...`);
  for (const m of migrations) {
    try {
      await db.execute(sql.raw(m.sql));
      console.log(`  ✅ ${m.name}`);
    } catch (err: any) {
      console.error(`  ❌ Migration failed [${m.name}]: ${err.message}`);
      throw err;
    }
  }
  console.log("✅ Startup migrations complete.");
}
