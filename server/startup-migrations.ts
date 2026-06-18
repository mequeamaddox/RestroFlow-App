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
  {
    name: "locations.bar_addon_enabled",
    sql: "ALTER TABLE locations ADD COLUMN IF NOT EXISTS bar_addon_enabled boolean DEFAULT false",
  },
  {
    name: "bar_inventory_counts table",
    sql: `CREATE TABLE IF NOT EXISTS bar_inventory_counts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      counted_by varchar(255) NOT NULL,
      count_date date NOT NULL DEFAULT CURRENT_DATE,
      shift varchar(50) NOT NULL DEFAULT 'end_of_day',
      notes text,
      status varchar(50) NOT NULL DEFAULT 'draft',
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )`,
  },
  {
    name: "bar_inventory_count_items table",
    sql: `CREATE TABLE IF NOT EXISTS bar_inventory_count_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      count_id uuid NOT NULL REFERENCES bar_inventory_counts(id) ON DELETE CASCADE,
      inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      fill_level numeric(5,4) NOT NULL DEFAULT 1,
      quantity_ml numeric(10,2),
      unit_cost numeric(10,4),
      notes text,
      created_at timestamp DEFAULT now()
    )`,
  },
  {
    name: "bar_waste_log table",
    sql: `CREATE TABLE IF NOT EXISTS bar_waste_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      inventory_item_id uuid REFERENCES inventory_items(id),
      menu_item_id uuid REFERENCES menu_items(id),
      item_name varchar(255) NOT NULL,
      quantity numeric(10,4) NOT NULL,
      unit varchar(20) NOT NULL DEFAULT 'oz',
      cost numeric(10,4),
      reason varchar(50) NOT NULL,
      notes text,
      logged_by varchar(255) NOT NULL,
      log_date timestamp NOT NULL DEFAULT now(),
      shift varchar(50),
      created_at timestamp DEFAULT now()
    )`,
  },
  {
    name: "locations fk cascade — add ON DELETE CASCADE to all FKs referencing locations(id)",
    sql: `
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT tc.constraint_name, tc.table_name, kcu.column_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.referential_constraints AS rc
            ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
          JOIN information_schema.key_column_usage AS ccu
            ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = 'locations'
            AND ccu.column_name = 'id'
            AND rc.delete_rule <> 'CASCADE'
        LOOP
          EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
          EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES locations(id) ON DELETE CASCADE',
            r.table_name, r.constraint_name, r.column_name
          );
        END LOOP;
      END $$
    `,
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
