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
