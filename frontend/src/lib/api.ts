import { treaty } from "@elysiajs/eden";
import type { App } from "../../../backend/src/index";
import { API_BASE_URL } from "@/lib/env";

// @ts-expect-error - Eden Treaty type bridge between separate node_modules
export const api = treaty<App>(API_BASE_URL, {
  fetch: {
    credentials: "include",
  },
});

/**
 * Extract typed data from an Eden Treaty response.
 *
 * Centralises the single `as T` assertion required because
 * the frontend/backend live in separate `node_modules` trees,
 * which breaks Eden's nominal type inference.
 *
 * @throws {Error} when the response contains an error or null data
 */
export function unwrap<T>(response: { data: unknown; error: unknown }): T {
  if (response.error) {
    const err = response.error;
    const message = typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : "API request failed";
    throw new Error(message);
  }
  if (response.data === null || response.data === undefined) {
    throw new Error("Empty response from API");
  }
  return response.data as T;
}

/**
 * Same as `unwrap` but returns `null` instead of throwing on error/empty.
 * Useful for optional data loading where a missing response is acceptable.
 */
export function unwrapOrNull<T>(response: { data: unknown; error: unknown }): T | null {
  if (response.error || response.data === null || response.data === undefined) {
    return null;
  }
  return response.data as T;
}
