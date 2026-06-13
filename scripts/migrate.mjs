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
