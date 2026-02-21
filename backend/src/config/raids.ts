// ─── Raid Data Configuration ───────────────────────────────────────────
// Purely ID-based. ALL names, slugs, dates, and icons come from APIs:
//   - WarcraftLogs → expansion names, raid names, boss names, encounter IDs
//   - Raider.IO    → raid slugs, per-region dates, raid icons, dungeon pools
//   - Blizzard     → boss icons (optional)
//
// The ONLY things defined here are numeric IDs and structural mappings
// that no single API provides.

// ─── Types ─────────────────────────────────────────────────────────────

export interface SeasonDef {
  /** Unique slug for this season — DB key (e.g. "tww-s2") */
  slug: string;
  /** Raider.IO expansion_id this season belongs to */
  rioExpansionId: number;
  /** Season number within its expansion */
  number: number;
  /** WCL zone IDs for the raids in this season */
  raidWclZoneIds: number[];
  /** Raider.IO M+ season slug (e.g. "season-tww-3") for fetching runs/scores */
  rioSeasonSlug?: string;
}

// ─── Tracked Expansions ────────────────────────────────────────────────
// Raider.IO expansion_id values. WCL expansion info is auto-derived
// from the zone details (each WCL zone includes its expansion).

export const TRACKED_RIO_EXPANSION_IDS: number[] = [
  11, // Midnight
  10, // The War Within
  9, // Dragonflight
];

// ─── Seasons ───────────────────────────────────────────────────────────
// This is the only mapping no API provides: which WCL zone IDs belong
// to which season. Everything else (names, slugs) is resolved at sync.

export const SEASONS: SeasonDef[] = [
  // ── The War Within ──────────────────────────────────────────────
  { slug: "tww-s3", rioExpansionId: 10, number: 3, raidWclZoneIds: [44], rioSeasonSlug: "season-tww-3" },
  { slug: "tww-s2", rioExpansionId: 10, number: 2, raidWclZoneIds: [42], rioSeasonSlug: "season-tww-2" },
  { slug: "tww-s1", rioExpansionId: 10, number: 1, raidWclZoneIds: [38], rioSeasonSlug: "season-tww-1" },

  // ── Dragonflight ────────────────────────────────────────────────
  { slug: "df-s4", rioExpansionId: 9, number: 4, raidWclZoneIds: [], rioSeasonSlug: "season-df-4" },
  { slug: "df-s3", rioExpansionId: 9, number: 3, raidWclZoneIds: [35], rioSeasonSlug: "season-df-3" },
  { slug: "df-s2", rioExpansionId: 9, number: 2, raidWclZoneIds: [33], rioSeasonSlug: "season-df-2" },
  { slug: "df-s1", rioExpansionId: 9, number: 1, raidWclZoneIds: [31], rioSeasonSlug: "season-df-1" },
];

// ─── Current Tier ──────────────────────────────────────────────────────
// WCL zone IDs for the current raid tier. Used for:
//   - Queue priority (current tier scanned first)
//   - Cache TTL (current tier refreshed more often)
//   - Frontend "current raid" badge

export const CURRENT_RAID_ZONE_IDS: number[] = [44];

// ─── WCL Difficulty Constants ──────────────────────────────────────────

export const DIFFICULTIES = {
  LFR: 1,
  NORMAL: 3,
  HEROIC: 4,
  MYTHIC: 5,
} as const;

export type Difficulty = (typeof DIFFICULTIES)[keyof typeof DIFFICULTIES];

// ─── Derived Helpers ───────────────────────────────────────────────────

/** All WCL zone IDs across every tracked season */
export function getAllTrackedZoneIds(): number[] {
  return SEASONS.flatMap((s) => s.raidWclZoneIds);
}

/** Find which season a WCL zone ID belongs to */
export function findSeasonByZoneId(zoneId: number): SeasonDef | undefined {
  return SEASONS.find((s) => s.raidWclZoneIds.includes(zoneId));
}

/** Get the RIO expansion ID for a given WCL zone ID */
export function findRioExpansionId(zoneId: number): number | undefined {
  return findSeasonByZoneId(zoneId)?.rioExpansionId;
}

/** Get unique RIO expansion IDs referenced by tracked seasons */
export function getUniqueRioExpansionIds(): number[] {
  return [...new Set(SEASONS.map((s) => s.rioExpansionId))];
}

/** All Raider.IO season slugs that have M+ data */
export function getAllRioSeasonSlugs(): string[] {
  return SEASONS.map((s) => s.rioSeasonSlug).filter((s): s is string => !!s);
}

/** Map from our internal season slug to RIO season slug */
export function getRioSeasonSlug(internalSlug: string): string | undefined {
  return SEASONS.find((s) => s.slug === internalSlug)?.rioSeasonSlug;
}

/** Map from RIO season slug to our internal season slug */
export function getInternalSeasonSlug(rioSeasonSlug: string): string | undefined {
  return SEASONS.find((s) => s.rioSeasonSlug === rioSeasonSlug)?.slug;
}

/** Get all tracked encounter IDs grouped by zone ID */
export function getZoneEncounterMapping(): Map<number, SeasonDef> {
  const map = new Map<number, SeasonDef>();
  for (const season of SEASONS) {
    for (const zoneId of season.raidWclZoneIds) {
      map.set(zoneId, season);
    }
  }
  return map;
}
