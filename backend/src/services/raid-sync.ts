// ─── Raid Data Sync Service ────────────────────────────────────────────
// API-driven orchestrator. All names, slugs, dates, and icons come from
// external APIs. The only static input is the ID-based config.
//
// Flow:
//   1. Fetch WCL zone details (via DB cache) → raid structure, bosses
//   2. Derive expansions from WCL zone.expansion fields
//   3. Fetch Raider.IO static data (via DB cache) → dates, slugs, icons
//   4. Match WCL zones ↔ RIO raids by name (fuzzy)
//   5. Optionally fetch Blizzard achievement icons for bosses
//   6. Upsert everything: expansions → seasons → raids → bosses

import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { apiCache, expansions, seasons, raids, bosses } from "../db/schema";
import type { RegionDates } from "../db/schema";
import { fetchWclZoneDetail, type WclZoneDetail } from "./warcraftlogs";
import { fetchRaidStaticData, type RaiderioRaidStaticData } from "./raiderio";
import { fetchAchievementIndex, findBossIconUrl, findRaidIconUrl } from "./blizzard";
import { SEASONS, getAllTrackedZoneIds, findSeasonByZoneId, getUniqueRioExpansionIds } from "../config/raids";
import { log as rootLog } from "../lib/logger";

const log = rootLog.child({ module: "raid-sync" });

// ─── Types ─────────────────────────────────────────────────────────────

export interface SyncResult {
  expansionsUpserted: number;
  seasonsUpserted: number;
  raidsUpserted: number;
  bossesUpserted: number;
  iconsFetched: number;
  datesFetched: number;
  errors: string[];
  durationMs: number;
}

export interface SyncOptions {
  /** Force sync even if data already exists */
  force?: boolean;
  /** Skip Blizzard icon resolution (faster) */
  skipIcons?: boolean;
}

// ─── API Cache Helpers ─────────────────────────────────────────────────

async function getCached<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(apiCache).where(eq(apiCache.key, key)).limit(1);

  if (!row) return null;

  const ageSeconds = (Date.now() - row.cachedAt.getTime()) / 1000;
  if (ageSeconds > row.ttlSeconds) {
    log.debug({ key, ageSeconds, ttl: row.ttlSeconds }, "Cache entry expired");
    return null;
  }

  log.debug({ key, ageSeconds: Math.round(ageSeconds) }, "Cache hit");
  return row.data as T;
}

async function setCache(key: string, data: unknown, ttlSeconds = 86400): Promise<void> {
  await db
    .insert(apiCache)
    .values({ key, data, ttlSeconds, cachedAt: new Date() })
    .onConflictDoUpdate({
      target: apiCache.key,
      set: {
        data: sql`excluded.data`,
        cachedAt: sql`excluded.cached_at`,
        ttlSeconds: sql`excluded.ttl_seconds`,
      },
    });
}

// ─── Slug Generation ───────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Phase 1: Fetch WCL Zone Details (with cache) ─────────────────────

async function fetchWclZonesWithCache(forceRefresh: boolean): Promise<{
  zoneDetails: Map<number, WclZoneDetail>;
  errors: string[];
}> {
  const zoneIds = getAllTrackedZoneIds();
  const zoneDetails = new Map<number, WclZoneDetail>();
  const errors: string[] = [];

  for (const zoneId of zoneIds) {
    const cacheKey = `wcl:zone:${zoneId}`;

    // Check DB cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getCached<WclZoneDetail>(cacheKey);
      if (cached) {
        if (cached.encounters.length > 0) {
          zoneDetails.set(zoneId, cached);
        }
        continue;
      }
    }

    // Fetch from API
    try {
      const detail = await fetchWclZoneDetail(zoneId);
      if (detail) {
        // Cache it — frozen zones get a very long TTL
        const ttl = detail.frozen ? 365 * 24 * 3600 : 86400;
        await setCache(cacheKey, detail, ttl);

        if (detail.encounters.length === 0) {
          log.debug({ zoneId, zoneName: detail.name }, "Skipping WCL zone with no encounters");
          continue;
        }
        zoneDetails.set(zoneId, detail);
      } else {
        errors.push(`WCL zone ${zoneId}: not found`);
      }
    } catch (error) {
      const msg = `WCL zone ${zoneId}: ${error instanceof Error ? error.message : "unknown error"}`;
      errors.push(msg);
      log.error({ err: error, zoneId }, "Failed to fetch WCL zone detail");
    }
  }

  log.info({ fetched: zoneDetails.size, total: zoneIds.length }, "WCL zone details ready");
  return { zoneDetails, errors };
}

// ─── Phase 2: Derive & Upsert Expansions ──────────────────────────────

async function upsertExpansionsFromWcl(zoneDetails: Map<number, WclZoneDetail>): Promise<{
  expansionDbIds: Map<number, string>; // wclExpansionId → DB id
  count: number;
}> {
  // Collect unique expansions from zone details
  const wclExpansions = new Map<number, { id: number; name: string; rioId: number }>();

  for (const zone of zoneDetails.values()) {
    if (!zone.expansion) continue;
    if (wclExpansions.has(zone.expansion.id)) continue;

    // Find matching RIO expansion ID from the season config
    const season = findSeasonByZoneId(zone.id);
    const rioId = season?.rioExpansionId ?? 0;

    wclExpansions.set(zone.expansion.id, {
      id: zone.expansion.id,
      name: zone.expansion.name,
      rioId,
    });
  }

  const expansionDbIds = new Map<number, string>();
  let count = 0;

  // Sort by WCL expansion ID (ascending = oldest first)
  const sorted = [...wclExpansions.values()].sort((a, b) => a.id - b.id);

  for (let i = 0; i < sorted.length; i++) {
    const exp = sorted[i];
    const slug = toSlug(exp.name);

    const [existing] = await db.select().from(expansions).where(eq(expansions.slug, slug)).limit(1);

    if (existing) {
      await db
        .update(expansions)
        .set({
          name: exp.name,
          wclExpansionId: exp.id,
          rioExpansionId: exp.rioId || existing.rioExpansionId,
          sortOrder: i + 1,
        })
        .where(eq(expansions.id, existing.id));
      expansionDbIds.set(exp.id, existing.id);
    } else {
      const [created] = await db
        .insert(expansions)
        .values({
          name: exp.name,
          slug,
          wclExpansionId: exp.id,
          rioExpansionId: exp.rioId || null,
          sortOrder: i + 1,
        })
        .returning();
      expansionDbIds.set(exp.id, created.id);
    }
    count++;
  }

  log.info({ count, expansions: [...wclExpansions.values()].map((e) => e.name) }, "Expansions upserted");
  return { expansionDbIds, count };
}

// ─── Phase 3: Upsert Seasons ──────────────────────────────────────────

async function upsertSeasons(
  zoneDetails: Map<number, WclZoneDetail>,
  expansionDbIds: Map<number, string>,
): Promise<{
  seasonDbIds: Map<string, string>; // season slug → DB id
  count: number;
}> {
  const seasonDbIds = new Map<string, string>();
  let count = 0;

  for (const seasonDef of SEASONS) {
    // Find the WCL expansion ID for this season via one of its zones
    let wclExpId: number | undefined;
    for (const zoneId of seasonDef.raidWclZoneIds) {
      const zone = zoneDetails.get(zoneId);
      if (zone?.expansion) {
        wclExpId = zone.expansion.id;
        break;
      }
    }

    // If no zones resolved, try finding expansion by RIO ID
    if (!wclExpId) {
      for (const [wclId, dbId] of expansionDbIds) {
        const [row] = await db.select().from(expansions).where(eq(expansions.id, dbId)).limit(1);
        if (row?.rioExpansionId === seasonDef.rioExpansionId) {
          wclExpId = wclId;
          break;
        }
      }
    }

    const expansionDbId = wclExpId ? expansionDbIds.get(wclExpId) : undefined;
    if (!expansionDbId) {
      log.warn({ season: seasonDef.slug }, "No expansion resolved for season — skipping");
      continue;
    }

    // Get expansion name for auto-generated season name
    const [expRow] = await db.select({ name: expansions.name }).from(expansions).where(eq(expansions.id, expansionDbId)).limit(1);

    const seasonName = expRow ? `${expRow.name} Season ${seasonDef.number}` : `Season ${seasonDef.number}`;

    const [existing] = await db.select().from(seasons).where(eq(seasons.slug, seasonDef.slug)).limit(1);

    if (existing) {
      await db.update(seasons).set({ name: seasonName, number: seasonDef.number, expansionId: expansionDbId }).where(eq(seasons.id, existing.id));
      seasonDbIds.set(seasonDef.slug, existing.id);
    } else {
      const [created] = await db
        .insert(seasons)
        .values({
          expansionId: expansionDbId,
          name: seasonName,
          slug: seasonDef.slug,
          number: seasonDef.number,
        })
        .returning();
      seasonDbIds.set(seasonDef.slug, created.id);
    }
    count++;
  }

  log.info({ count }, "Seasons upserted");
  return { seasonDbIds, count };
}

// ─── Phase 4: Fetch RIO Data (with cache) ─────────────────────────────

async function fetchRioDataWithCache(forceRefresh: boolean): Promise<{
  rioMap: Map<string, RaiderioRaidStaticData>;
  datesFetched: number;
  errors: string[];
}> {
  const rioMap = new Map<string, RaiderioRaidStaticData>();
  const errors: string[] = [];
  const rioExpIds = getUniqueRioExpansionIds();

  for (const expansionId of rioExpIds) {
    const cacheKey = `rio:raids:${expansionId}`;

    // Check DB cache
    if (!forceRefresh) {
      const cached = await getCached<RaiderioRaidStaticData[]>(cacheKey);
      if (cached) {
        for (const raid of cached) {
          rioMap.set(raid.slug.toLowerCase(), raid);
          rioMap.set(raid.name.toLowerCase(), raid);
        }
        continue;
      }
    }

    // Fetch from API
    try {
      const raidData = await fetchRaidStaticData(expansionId);
      await setCache(cacheKey, raidData, 86400);

      for (const raid of raidData) {
        rioMap.set(raid.slug.toLowerCase(), raid);
        rioMap.set(raid.name.toLowerCase(), raid);
      }

      log.debug({ expansionId, raidCount: raidData.length }, "Fetched RIO raid data for expansion");
    } catch (error) {
      const msg = `RIO expansion ${expansionId}: ${error instanceof Error ? error.message : "unknown error"}`;
      errors.push(msg);
      log.warn({ err: error, expansionId }, "Failed to fetch RIO raid data");
    }
  }

  // Each raid is keyed by both slug and name, so divide by 2 for real count
  return { rioMap, datesFetched: Math.floor(rioMap.size / 2), errors };
}

// ─── RIO Matching ──────────────────────────────────────────────────────

function findRioMatch(rioMap: Map<string, RaiderioRaidStaticData>, wclZoneName: string): { match: RaiderioRaidStaticData; matchType: string } | null {
  const slug = toSlug(wclZoneName);
  const lowerName = wclZoneName.toLowerCase();

  // Tier 1: Exact slug match
  const bySlug = rioMap.get(slug);
  if (bySlug) return { match: bySlug, matchType: "slug" };

  // Tier 2: Exact name match (case-insensitive)
  const byName = rioMap.get(lowerName);
  if (byName) return { match: byName, matchType: "name" };

  // Tier 3: Substring match (either direction)
  for (const [key, raid] of rioMap) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return { match: raid, matchType: "substring" };
    }
  }

  return null;
}

// ─── Phase 5: Optional Blizzard Icons ──────────────────────────────────

async function fetchBlizzardIcons(zoneDetails: Map<number, WclZoneDetail>): Promise<{
  raidIcons: Map<string, string | null>;
  bossIcons: Map<string, string | null>;
  iconsFetched: number;
  errors: string[];
}> {
  const raidIcons = new Map<string, string | null>();
  const bossIcons = new Map<string, string | null>();
  const errors: string[] = [];
  let iconsFetched = 0;

  try {
    const achievementIndex = await fetchAchievementIndex();
    if (achievementIndex.length === 0) {
      errors.push("Blizzard achievement index is empty — skipping icon resolution");
      return { raidIcons, bossIcons, iconsFetched: 0, errors };
    }

    const uniqueBossNames = new Set<string>();
    const uniqueRaidNames = new Set<string>();

    for (const zone of zoneDetails.values()) {
      uniqueRaidNames.add(zone.name);
      for (const encounter of zone.encounters) {
        uniqueBossNames.add(encounter.name);
      }
    }

    for (const raidName of uniqueRaidNames) {
      try {
        const iconUrl = await findRaidIconUrl(raidName, achievementIndex);
        raidIcons.set(raidName, iconUrl);
        if (iconUrl) iconsFetched++;
      } catch {
        raidIcons.set(raidName, null);
      }
    }

    for (const bossName of uniqueBossNames) {
      try {
        const iconUrl = await findBossIconUrl(bossName, achievementIndex);
        bossIcons.set(bossName, iconUrl);
        if (iconUrl) iconsFetched++;
      } catch {
        bossIcons.set(bossName, null);
      }
    }

    log.info({ raidIcons: raidIcons.size, bossIcons: bossIcons.size, resolved: iconsFetched }, "Blizzard icon resolution complete");
  } catch (error) {
    const msg = `Blizzard icon fetch failed: ${error instanceof Error ? error.message : "unknown error"}`;
    errors.push(msg);
    log.error({ err: error }, "Blizzard icon fetch failed entirely");
  }

  return { raidIcons, bossIcons, iconsFetched, errors };
}

// ─── Phase 6: Upsert Raids + Bosses ───────────────────────────────────

async function upsertRaidsAndBosses(
  zoneDetails: Map<number, WclZoneDetail>,
  rioMap: Map<string, RaiderioRaidStaticData>,
  raidIcons: Map<string, string | null>,
  bossIcons: Map<string, string | null>,
  seasonDbIds: Map<string, string>,
): Promise<{
  raidsUpserted: number;
  bossesUpserted: number;
  errors: string[];
}> {
  let raidsUpserted = 0;
  let bossesUpserted = 0;
  const errors: string[] = [];

  for (const [zoneId, zone] of zoneDetails) {
    const seasonDef = findSeasonByZoneId(zoneId);
    if (!seasonDef) {
      errors.push(`No season mapping for WCL zone ${zoneId} (${zone.name})`);
      continue;
    }

    const seasonId = seasonDbIds.get(seasonDef.slug);
    if (!seasonId) {
      errors.push(`Season DB ID not found for ${seasonDef.slug}`);
      continue;
    }

    // Match to RIO for dates, slug, and icon
    const rioResult = findRioMatch(rioMap, zone.name);
    const rioRaid = rioResult?.match ?? null;

    if (rioResult) {
      log.debug({ zoneId, zoneName: zone.name, rioSlug: rioRaid!.slug, matchType: rioResult.matchType }, "Matched WCL zone to RIO raid");
    } else {
      log.warn({ zoneId, zoneName: zone.name }, "No RIO match — stored without dates/slug");
    }

    // Prefer RIO slug, fall back to generated slug from WCL name
    const raidSlug = rioRaid?.slug ?? toSlug(zone.name);
    const regionStartDates: RegionDates | null = rioRaid?.starts ?? null;
    const regionEndDates: RegionDates | null = rioRaid?.ends ?? null;

    // Icon priority: RIO icon > Blizzard achievement icon > existing
    const rioIconUrl = rioRaid?.icon ?? null;
    const blizzardIconUrl = raidIcons.get(zone.name) ?? null;

    const [existingRaid] = await db.select().from(raids).where(eq(raids.wclZoneId, zoneId)).limit(1);

    let raidId: string;

    if (existingRaid) {
      await db
        .update(raids)
        .set({
          name: zone.name,
          slug: raidSlug,
          seasonId,
          iconUrl: rioIconUrl ?? blizzardIconUrl ?? existingRaid.iconUrl,
          raiderioSlug: rioRaid?.slug ?? existingRaid.raiderioSlug,
          regionStartDates: regionStartDates ?? existingRaid.regionStartDates,
          regionEndDates: regionEndDates ?? existingRaid.regionEndDates,
          sortOrder: raidsUpserted,
        })
        .where(eq(raids.id, existingRaid.id));
      raidId = existingRaid.id;
    } else {
      const [created] = await db
        .insert(raids)
        .values({
          seasonId,
          name: zone.name,
          slug: raidSlug,
          wclZoneId: zoneId,
          iconUrl: rioIconUrl ?? blizzardIconUrl,
          raiderioSlug: rioRaid?.slug ?? null,
          regionStartDates,
          regionEndDates,
          sortOrder: raidsUpserted,
        })
        .returning();
      raidId = created.id;
    }
    raidsUpserted++;

    log.debug({ raidSlug, zoneId, bossCount: zone.encounters.length, hasDates: !!rioRaid }, "Upserted raid");

    // Upsert bosses from WCL encounters
    for (let i = 0; i < zone.encounters.length; i++) {
      const encounter = zone.encounters[i];
      const bossSlug = toSlug(encounter.name);

      // Look for existing boss by raidId + wclEncounterId
      const [existingBoss] = await db
        .select()
        .from(bosses)
        .where(and(eq(bosses.raidId, raidId), eq(bosses.wclEncounterId, encounter.id)))
        .limit(1);

      if (existingBoss) {
        await db
          .update(bosses)
          .set({
            name: encounter.name,
            slug: bossSlug,
            iconUrl: bossIcons.get(encounter.name) ?? existingBoss.iconUrl,
            sortOrder: i + 1,
          })
          .where(eq(bosses.id, existingBoss.id));
      } else {
        await db
          .insert(bosses)
          .values({
            raidId,
            name: encounter.name,
            slug: bossSlug,
            wclEncounterId: encounter.id,
            iconUrl: bossIcons.get(encounter.name) ?? null,
            sortOrder: i + 1,
          })
          .onConflictDoNothing();
      }
      bossesUpserted++;
    }
  }

  return { raidsUpserted, bossesUpserted, errors };
}

// ─── Main Entry Point ──────────────────────────────────────────────────

/**
 * Synchronize raid data from WarcraftLogs + Raider.IO (+ optional Blizzard icons).
 *
 * Triggered from:
 *   - Startup (if DB is empty or SYNC_ON_STARTUP=true)
 *   - Admin endpoint (POST /api/admin/sync-raids)
 *   - Scheduled daily job
 */
export async function syncRaidData(options: SyncOptions = {}): Promise<SyncResult> {
  const startTime = Date.now();
  const allErrors: string[] = [];
  const forceRefresh = options.force ?? false;

  log.info({ options }, "Starting raid data sync");

  // ── Phase 1: Fetch WCL zone details ─────────────────────────────
  log.info("Phase 1: Fetching WCL zone details");
  const { zoneDetails, errors: wclErrors } = await fetchWclZonesWithCache(forceRefresh);
  allErrors.push(...wclErrors);

  if (zoneDetails.size === 0) {
    const msg = "No WCL zone details fetched — aborting sync";
    log.error(msg);
    allErrors.push(msg);
    return {
      expansionsUpserted: 0,
      seasonsUpserted: 0,
      raidsUpserted: 0,
      bossesUpserted: 0,
      iconsFetched: 0,
      datesFetched: 0,
      errors: allErrors,
      durationMs: Date.now() - startTime,
    };
  }
  log.info({ zoneCount: zoneDetails.size }, "Phase 1 complete");

  // ── Phase 2: Derive & upsert expansions from WCL data ──────────
  log.info("Phase 2: Upserting expansions from WCL zone data");
  const { expansionDbIds, count: expansionsUpserted } = await upsertExpansionsFromWcl(zoneDetails);
  log.info({ expansionsUpserted }, "Phase 2 complete");

  // ── Phase 3: Upsert seasons from config ─────────────────────────
  log.info("Phase 3: Upserting seasons");
  const { seasonDbIds, count: seasonsUpserted } = await upsertSeasons(zoneDetails, expansionDbIds);
  log.info({ seasonsUpserted }, "Phase 3 complete");

  // ── Phase 4: Fetch Raider.IO data ───────────────────────────────
  log.info("Phase 4: Fetching Raider.IO raid data");
  const { rioMap, datesFetched, errors: rioErrors } = await fetchRioDataWithCache(forceRefresh);
  allErrors.push(...rioErrors);
  log.info({ datesFetched }, "Phase 4 complete");

  // ── Phase 5: Optional Blizzard icons ────────────────────────────
  let raidIcons = new Map<string, string | null>();
  let bossIcons = new Map<string, string | null>();
  let iconsFetched = 0;

  if (!options.skipIcons) {
    log.info("Phase 5: Fetching Blizzard achievement icons");
    const iconResult = await fetchBlizzardIcons(zoneDetails);
    raidIcons = iconResult.raidIcons;
    bossIcons = iconResult.bossIcons;
    iconsFetched = iconResult.iconsFetched;
    allErrors.push(...iconResult.errors);
    log.info({ iconsFetched }, "Phase 5 complete");
  } else {
    log.info("Phase 5: Skipped (skipIcons=true)");
  }

  // ── Phase 6: Upsert raids + bosses ─────────────────────────────
  log.info("Phase 6: Upserting raids and bosses to DB");
  const { raidsUpserted, bossesUpserted, errors: upsertErrors } = await upsertRaidsAndBosses(zoneDetails, rioMap, raidIcons, bossIcons, seasonDbIds);
  allErrors.push(...upsertErrors);
  log.info({ raidsUpserted, bossesUpserted }, "Phase 6 complete");

  const result: SyncResult = {
    expansionsUpserted,
    seasonsUpserted,
    raidsUpserted,
    bossesUpserted,
    iconsFetched,
    datesFetched,
    errors: allErrors,
    durationMs: Date.now() - startTime,
  };

  if (allErrors.length > 0) {
    log.warn({ result }, "Raid data sync completed with errors");
  } else {
    log.info({ result }, "Raid data sync completed successfully");
  }

  return result;
}

/**
 * Check if the raids table is empty (first-run detection).
 */
export async function isRaidDataEmpty(): Promise<boolean> {
  const [row] = await db.select({ id: raids.id }).from(raids).limit(1);
  return !row;
}
