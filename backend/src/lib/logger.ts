// ─── Logger ────────────────────────────────────────────────────────────
// Single source of truth for all backend logging.
// Every file imports `log` (or a child) from here.
// If we ever swap pino for another library, only this file changes.

import { createPinoLogger } from "@bogeychan/elysia-logger";

const isDev = process.env.NODE_ENV !== "production";

export const log = createPinoLogger({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  }),
});
