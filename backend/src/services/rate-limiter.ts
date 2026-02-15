// ─── Rate Limit Manager ────────────────────────────────────────────────
// Global singleton that tracks API rate limits across all external services

interface RateLimitState {
  remaining: number;
  limit: number;
  resetAt: number; // Unix timestamp in ms
  requestsThisHour: number;
}

class RateLimitManager {
  private limits: Map<string, RateLimitState> = new Map();
  private pauseCallbacks: Map<string, () => void> = new Map();
  private resumeCallbacks: Map<string, () => void> = new Map();

  constructor() {
    // Initialize default states
    this.limits.set("wcl", {
      remaining: 3600,
      limit: 3600,
      resetAt: Date.now() + 3600_000,
      requestsThisHour: 0,
    });
    this.limits.set("blizzard", {
      remaining: 36000,
      limit: 36000,
      resetAt: Date.now() + 3600_000,
      requestsThisHour: 0,
    });
    this.limits.set("raiderio", {
      remaining: Infinity,
      limit: Infinity,
      resetAt: Date.now() + 3600_000,
      requestsThisHour: 0,
    });
  }

  registerPauseResume(service: string, onPause: () => void, onResume: () => void) {
    this.pauseCallbacks.set(service, onPause);
    this.resumeCallbacks.set(service, onResume);
  }

  update(service: string, remaining: number, limit: number, resetAt?: number) {
    const current = this.limits.get(service) ?? {
      remaining,
      limit,
      resetAt: Date.now() + 3600_000,
      requestsThisHour: 0,
    };

    current.remaining = remaining;
    current.limit = limit;
    if (resetAt) current.resetAt = resetAt;
    current.requestsThisHour++;

    this.limits.set(service, current);

    // If WCL is near exhaustion, pause processing
    if (service === "wcl" && remaining <= 10) {
      console.log(`[RateLimit] WCL points nearly exhausted (${remaining} remaining). Pausing...`);
      const pauseFn = this.pauseCallbacks.get("wcl");
      if (pauseFn) pauseFn();

      // Schedule resume
      const timeUntilReset = Math.max(0, current.resetAt - Date.now()) + 5000;
      console.log(`[RateLimit] Will resume WCL processing in ${Math.round(timeUntilReset / 1000)}s`);
      setTimeout(() => {
        console.log("[RateLimit] Resuming WCL processing");
        const resumeFn = this.resumeCallbacks.get("wcl");
        if (resumeFn) resumeFn();
      }, timeUntilReset);
    }
  }

  trackRequest(service: string) {
    const state = this.limits.get(service);
    if (state) {
      state.requestsThisHour++;
      if (state.remaining > 0) state.remaining--;
      this.limits.set(service, state);
    }
  }

  canMakeRequest(service: string): boolean {
    const state = this.limits.get(service);
    if (!state) return true;
    return state.remaining > 0;
  }

  getStatus(service: string): RateLimitState | null {
    return this.limits.get(service) ?? null;
  }

  getAllStatus(): Record<string, RateLimitState> {
    const result: Record<string, RateLimitState> = {};
    for (const [key, value] of this.limits) {
      result[key] = { ...value };
    }
    return result;
  }
}

// Global singleton
export const rateLimitManager = new RateLimitManager();
