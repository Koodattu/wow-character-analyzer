import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Run all pending Drizzle migrations, then optionally seed.
 * Called once at startup before the Elysia server begins listening.
 *
 * Uses a dedicated connection (max 1) so the migration advisory lock
 * doesn't interfere with the app connection pool.
 */
export async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for migrations");

  // Short-lived single connection just for migrations
  const migrationClient = postgres(url, { max: 1 });
  const migrationDb = drizzle(migrationClient);

  console.log("[Migrate] Running pending migrations…");
  await migrate(migrationDb, { migrationsFolder: "./drizzle" });
  console.log("[Migrate] Migrations complete.");

  await migrationClient.end();
}
