import { openapi } from "@elysia/openapi";

export const apiDocs = openapi({
  path: "/swagger",
  scalar: { url: "/swagger/json", version: "1.81.0" },
  documentation: {
    info: {
      title: "WoW Character Analyzer API",
      version: "1.0.0",
      description: "API for analyzing World of Warcraft character PvE performance",
    },
  },
});
