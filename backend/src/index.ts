import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { runMigrations } from "./db/migrate";
import { authRoutes } from "./auth/routes";
import { characterRoutes } from "./routes/characters";
import { userRoutes } from "./routes/user";
import { adminRoutes } from "./routes/admin";

// Import queue module to start workers (side-effect)
import "./queue";

// ── Run migrations & seed before starting the server ─────
await runMigrations();

// Seed is idempotent (onConflictDoNothing) — safe to run every startup
const { seed } = await import("./db/seed");
await seed();

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const app = new Elysia()
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
    console.error("[Server] Error:", error);

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

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

// THE MOST IMPORTANT LINE:
export type App = typeof app;
