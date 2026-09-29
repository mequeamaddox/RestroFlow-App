import { defineConfig } from "drizzle-kit";

// DATABASE_URL is required for push/migrate but not for generate (which only reads the schema).
// Passing an empty string lets `drizzle-kit generate` work in CI/offline environments.
const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
