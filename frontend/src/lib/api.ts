import { treaty } from "@elysiajs/eden";
import type { App } from "../../../backend/src/index";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// @ts-expect-error - Eden Treaty type bridge between separate node_modules
export const api = treaty<App>(API_URL, {
  fetch: {
    credentials: "include",
  },
});
