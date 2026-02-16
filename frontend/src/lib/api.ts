import { treaty } from "@elysiajs/eden";
import type { App } from "../../../backend/src/index";
import { API_BASE_URL } from "@/lib/env";

// @ts-expect-error - Eden Treaty type bridge between separate node_modules
export const api = treaty<App>(API_BASE_URL, {
  fetch: {
    credentials: "include",
  },
});
