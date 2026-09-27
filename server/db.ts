import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or NEON_DATABASE_URL) must be set. Did you forget to provision a database?",
  );
}

// Validate URL format before handing it to the Neon driver.
// new URL() will throw "Invalid URL" for any malformed string,
// giving a clear error at startup rather than a cryptic failure on the first query.
try {
  new URL(connectionString);
} catch {
  throw new Error(
    `DATABASE_URL is not a valid URL (starts with: ${connectionString.substring(0, 20)}...). ` +
    "Check the Railway environment variable — it must be a full postgres:// connection string."
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });

// Async startup probe — logs DB connectivity without blocking the server from starting.
// If this fails, check Railway logs: the Neon database may be paused, deleted, or
// the DATABASE_URL credential may have been rotated.
setImmediate(() => {
  pool.query('SELECT 1').then(() => {
    console.log('✅ [DB] Database connection verified');
  }).catch((err: Error) => {
    console.error('❌ [DB] Database connection FAILED on startup probe:', err.message);
    console.error('❌ [DB] Queries will fail until this is resolved.');
    console.error('❌ [DB] Check: 1) Neon dashboard — is the database active?');
    console.error('❌ [DB] Check: 2) Railway → Variables → DATABASE_URL is the correct Neon connection string');
  });
});