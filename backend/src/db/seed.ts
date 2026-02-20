// ─── Database Seed Script ──────────────────────────────────────────────
// Previously contained hardcoded expansion/season/raid/boss data.
// Now all config layer data (expansions, seasons, raids, bosses, dungeons)
// is populated by the raid sync service from external APIs.
//
// This file is kept for potential future use:
// - Seeding spec_defensives per season
// - Seeding season_consumables per season
// - Any non-API-derivable reference data
//
// Run with: bun run src/db/seed.ts
import { log } from "../lib/logger";

async function seed() {
  log.info("Seed: no static seed data to insert (config layer is API-driven via raid-sync)");
}

export { seed };

// Allow running as a standalone script: bun run src/db/seed.ts
if (import.meta.main) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, "Seed failed");
      process.exit(1);
    });
}
