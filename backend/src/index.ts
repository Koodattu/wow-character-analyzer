import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { log } from "./lib/logger";
import { runMigrations } from "./db/migrate";
import { authRoutes } from "./auth/routes";
import { characterRoutes } from "./routes/characters";
import { userRoutes } from "./routes/user";
import { adminRoutes } from "./routes/admin";
import { syncRaidData, isRaidDataEmpty } from "./services/raid-sync";

// Import queue module to start workers (side-effect)
import "./queue";

// ── Run migrations & seed before starting the server ─────
await runMigrations();

// Seed is now a no-op (config layer is API-driven via raid-sync)
const { seed } = await import("./db/seed");
await seed();

// ── Background raid data sync ────────────────────────────
// Runs non-blocking after server starts. Triggered when:
//   1. Raids table is empty (first run — always syncs)
//   2. SYNC_ON_STARTUP=true env var is set
const SYNC_ON_STARTUP = process.env.SYNC_ON_STARTUP === "true";
const SYNC_SCHEDULE_ENABLED = process.env.SYNC_SCHEDULE_ENABLED === "true";
const SYNC_SCHEDULE_HOURS = parseInt(process.env.SYNC_SCHEDULE_HOURS ?? "3", 10); // Default: 03:00 UTC

async function runBackgroundSync() {
  try {
    const empty = await isRaidDataEmpty();
    if (empty || SYNC_ON_STARTUP) {
      const reason = empty ? "raids table is empty (first run)" : "SYNC_ON_STARTUP=true";
      log.info({ reason }, "Starting background raid data sync");
      const result = await syncRaidData();
      log.info({ result }, "Background raid data sync finished");
    } else {
      log.info("Skipping startup raid sync (data exists, SYNC_ON_STARTUP not set)");
    }
  } catch (error) {
    log.error({ err: error }, "Background raid data sync failed");
  }
}

// Fire-and-forget — don't block server startup
runBackgroundSync();

// ── Scheduled raid data sync ─────────────────────────────
if (SYNC_SCHEDULE_ENABLED) {
  function scheduleNextSync() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(SYNC_SCHEDULE_HOURS, 0, 0, 0);

    // If we've already passed today's sync time, schedule for tomorrow
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    const msUntilSync = next.getTime() - now.getTime();
    log.info({ nextSyncAt: next.toISOString(), hoursFromNow: (msUntilSync / 3600_000).toFixed(1) }, "Scheduled next raid data sync");

    setTimeout(async () => {
      try {
        log.info("Running scheduled raid data sync");
        const result = await syncRaidData();
        log.info({ result }, "Scheduled raid data sync finished");
      } catch (error) {
        log.error({ err: error }, "Scheduled raid data sync failed");
      }
      // Reschedule for next day
      scheduleNextSync();
    }, msUntilSync);
  }

  scheduleNextSync();
}

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const app = new Elysia()
  .use(log.into({ autoLogging: true }))
  .use(
    cors({
      origin: CORS_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    }),
  )
  .use(
    swagger({
      documentation: {
        info: {
          title: "WoW Character Analyzer API",
          version: "1.0.0",
          description: "API for analyzing World of Warcraft character PvE performance",
        },
      },
    }),
  )
  .onError(({ error, set }) => {
    log.error({ err: error }, "Unhandled server error");

    const message = "message" in error ? error.message : String(error);

    if (message === "Unauthorized") {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    if (message === "Forbidden") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    // Never leak stack traces
    set.status = 500;
    return { error: "Internal server error" };
  })
  .get("/", () => ({
    name: "WoW Character Analyzer API",
    version: "1.0.0",
    status: "running",
  }))
  .get("/health", () => ({ status: "ok" }))
  .use(authRoutes)
  .use(characterRoutes)
  .use(userRoutes)
  .use(adminRoutes)
  .listen(PORT);

log.info({ host: app.server?.hostname, port: app.server?.port }, "🦊 Elysia is running");

// THE MOST IMPORTANT LINE:
export type App = typeof app;
