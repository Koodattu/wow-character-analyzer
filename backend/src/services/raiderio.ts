// ─── Raider.IO API Client ──────────────────────────────────────────────
import { rateLimitManager } from "./rate-limiter";
import { log as rootLog } from "../lib/logger";

const log = rootLog.child({ module: "raiderio" });
const RAIDERIO_BASE = "https://raider.io/api/v1";
const RAIDERIO_API_KEY = process.env.RAIDERIO_API_KEY ?? "";
const API_DELAY_MS = RAIDERIO_API_KEY ? 100 : 200; // authenticated clients can be faster

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Append the API key as a query parameter if configured */
function withApiKey(url: string): string {
  if (!RAIDERIO_API_KEY) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}access_key=${encodeURIComponent(RAIDERIO_API_KEY)}`;
}

async function raiderioFetch(url: string): Promise<any> {
  rateLimitManager.trackRequest("raiderio");
  await sleep(API_DELAY_MS);

  const fullUrl = withApiKey(url);
  log.debug({ url: fullUrl }, "Raider.IO API request");
  const response = await fetch(fullUrl);

  if (!response.ok) {
    if (response.status === 400 || response.status === 404) {
      log.debug({ url: fullUrl, status: response.status }, "Raider.IO API: resource not found");
      return null;
    }
    log.error({ url: fullUrl, status: response.status }, "Raider.IO API error");
    throw new Error(`Raider.IO API error: ${response.status} ${url}`);
  }

  log.debug({ url: fullUrl, status: response.status }, "Raider.IO API success");
  return response.json();
}

// ─── Types ─────────────────────────────────────────────────────────────
export interface RaiderioProfile {
  name: string;
  race: string;
  class: string;
  active_spec_name: string;
  active_spec_role: string;
  gender: string;
  faction: string;
  region: string;
  realm: string;
  profile_url: string;
  thumbnail_url: string;
}

export interface RaiderioMythicPlusScore {
  season: string;
  scores: {
    all: number;
    dps: number;
    healer: number;
    tank: number;
  };
}

export interface RaiderioMythicPlusRun {
  dungeon: string;
  short_name: string;
  mythic_level: number;
  completed_at: string;
  clear_time_ms: number;
  par_time_ms: number;
  num_keystone_upgrades: number;
  score: number;
  url: string;
}

export interface RaiderioRaidProgression {
  [raidSlug: string]: {
    summary: string;
    total_bosses: number;
    normal_bosses_killed: number;
    heroic_bosses_killed: number;
    mythic_bosses_killed: number;
  };
}

export interface RaiderioCharacterData {
  profile: RaiderioProfile;
  mythicPlusScores: RaiderioMythicPlusScore[];
  mythicPlusBestRuns: RaiderioMythicPlusRun[];
  mythicPlusRecentRuns: RaiderioMythicPlusRun[];
  mythicPlusAlternateRuns: RaiderioMythicPlusRun[];
  raidProgression: RaiderioRaidProgression | null;
}

// ─── Fetch Character Data ──────────────────────────────────────────────
export async function fetchRaiderioCharacter(characterName: string, realmSlug: string, region: string = "eu"): Promise<RaiderioCharacterData | null> {
  const fields = ["mythic_plus_scores_by_season:current", "mythic_plus_best_runs:all", "mythic_plus_recent_runs", "mythic_plus_alternate_runs:all", "raid_progression"].join(",");

  const url = `${RAIDERIO_BASE}/characters/profile?region=${region}&realm=${realmSlug}&name=${encodeURIComponent(characterName)}&fields=${fields}`;
  const data = await raiderioFetch(url);

  if (!data) return null;

  return {
    profile: {
      name: data.name,
      race: data.race,
      class: data.class,
      active_spec_name: data.active_spec_name,
      active_spec_role: data.active_spec_role,
      gender: data.gender,
      faction: data.faction,
      region: data.region,
      realm: data.realm,
      profile_url: data.profile_url,
      thumbnail_url: data.thumbnail_url,
    },
    mythicPlusScores: (data.mythic_plus_scores_by_season ?? []).map((s: any) => ({
      season: s.season,
      scores: s.scores,
    })),
    mythicPlusBestRuns: data.mythic_plus_best_runs ?? [],
    mythicPlusRecentRuns: data.mythic_plus_recent_runs ?? [],
    mythicPlusAlternateRuns: data.mythic_plus_alternate_runs ?? [],
    raidProgression: data.raid_progression ?? null,
  };
}

// ─── Raid Static Data (Start/End Dates) ────────────────────────────────

export interface RaiderioRaidStaticData {
  id: number;
  slug: string;
  name: string;
  short_name: string;
  icon: string | null;
  starts: { us?: string; eu?: string; tw?: string; kr?: string; cn?: string };
  ends: { us?: string; eu?: string; tw?: string; kr?: string; cn?: string };
  encounters: Array<{ id: number; slug: string; name: string }>;
}

/**
 * Fetch raid static data (start/end dates, encounters) for a specific expansion.
 * Used during raid data sync to get per-region dates.
 */
export async function fetchRaidStaticData(expansionId: number): Promise<RaiderioRaidStaticData[]> {
  const url = `${RAIDERIO_BASE}/raiding/static-data?expansion_id=${expansionId}`;
  const data = await raiderioFetch(url);

  if (!data?.raids) {
    log.warn({ expansionId }, "No raid data returned from Raider.IO for expansion");
    return [];
  }

  return data.raids.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    short_name: r.short_name,
    icon: r.icon ?? null,
    starts: r.starts ?? {},
    ends: r.ends ?? {},
    encounters: (r.encounters ?? []).map((e: any) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
    })),
  }));
}

/**
 * Fetch raid dates for all tracked expansions.
 * Returns a Map keyed by both slug (lowercase) and name (lowercase)
 * for flexible matching against WCL zone names.
 */
export async function fetchAllRaidDates(expansionIds: number[]): Promise<Map<string, RaiderioRaidStaticData>> {
  const map = new Map<string, RaiderioRaidStaticData>();

  for (const expansionId of expansionIds) {
    try {
      const raids = await fetchRaidStaticData(expansionId);
      for (const raid of raids) {
        // Key by both slug and name for flexible matching
        map.set(raid.slug.toLowerCase(), raid);
        map.set(raid.name.toLowerCase(), raid);
      }
      log.debug({ expansionId, raidCount: raids.length }, "Fetched Raider.IO raid dates for expansion");
    } catch (error) {
      // Non-fatal: continue with other expansions
      log.warn({ err: error, expansionId }, "Failed to fetch Raider.IO raid dates for expansion");
    }

    // Be polite: 500ms between expansion fetches
    await sleep(500);
  }

  log.info({ totalEntries: map.size, expansionCount: expansionIds.length }, "Raider.IO raid date fetch complete");
  return map;
}

// ─── Fetch Historical Scores ───────────────────────────────────────────
export async function fetchRaiderioHistoricalScores(
  characterName: string,
  realmSlug: string,
  region: string = "eu",
  seasonSlugs: string[] = [],
): Promise<RaiderioMythicPlusScore[]> {
  if (seasonSlugs.length === 0) return [];

  const seasonFields = seasonSlugs.map((s) => `mythic_plus_scores_by_season:${s}`).join(",");

  const url = `${RAIDERIO_BASE}/characters/profile?region=${region}&realm=${realmSlug}&name=${encodeURIComponent(characterName)}&fields=${seasonFields}`;
  const data = await raiderioFetch(url);

  if (!data?.mythic_plus_scores_by_season) return [];

  return data.mythic_plus_scores_by_season.map((s: any) => ({
    season: s.season,
    scores: s.scores,
  }));
}

// ─── Fetch Season-Specific Best Runs ───────────────────────────────────
/**
 * Fetch best + alternate runs for a specific historical M+ season.
 * Returns best run per dungeon (fortified + tyrannical).
 */
export async function fetchRaiderioSeasonBestRuns(
  characterName: string,
  realmSlug: string,
  region: string = "eu",
  seasonSlug: string,
): Promise<{ bestRuns: RaiderioMythicPlusRun[]; alternateRuns: RaiderioMythicPlusRun[] }> {
  const fields = [`mythic_plus_best_runs:all:${seasonSlug}`, `mythic_plus_alternate_runs:all:${seasonSlug}`].join(",");

  const url = `${RAIDERIO_BASE}/characters/profile?region=${region}&realm=${realmSlug}&name=${encodeURIComponent(characterName)}&fields=${fields}`;
  const data = await raiderioFetch(url);

  if (!data) return { bestRuns: [], alternateRuns: [] };

  return {
    bestRuns: data.mythic_plus_best_runs ?? [],
    alternateRuns: data.mythic_plus_alternate_runs ?? [],
  };
}

// ─── M+ Static Data (Dungeon Pools per Season) ────────────────────────

export interface RaiderioMplusSeason {
  slug: string;
  name: string;
  short_name: string;
  blizzard_season_id: number;
  is_main_season: boolean;
  starts: { us?: string; eu?: string; tw?: string; kr?: string; cn?: string };
  ends: { us?: string; eu?: string; tw?: string; kr?: string; cn?: string };
  dungeons: Array<{
    id: number;
    challenge_mode_id: number;
    slug: string;
    name: string;
    short_name: string;
    keystone_timer_seconds: number;
    icon_url: string;
    background_image_url: string;
  }>;
}

/**
 * Fetch M+ static data (seasons & dungeon pools) for a given expansion.
 * expansion_id: 11 = Midnight, 10 = TheWarWithin, 9 = Dragonflight
 */
export async function fetchMythicPlusStaticData(expansionId: number): Promise<RaiderioMplusSeason[]> {
  const url = `${RAIDERIO_BASE}/mythic-plus/static-data?expansion_id=${expansionId}`;
  const data = await raiderioFetch(url);

  if (!data?.seasons) {
    log.warn({ expansionId }, "No M+ season data returned from Raider.IO");
    return [];
  }

  return data.seasons.map((s: any) => ({
    slug: s.slug,
    name: s.name,
    short_name: s.short_name,
    blizzard_season_id: s.blizzard_season_id,
    is_main_season: s.is_main_season ?? false,
    starts: s.starts ?? {},
    ends: s.ends ?? {},
    dungeons: (s.dungeons ?? []).map((d: any) => ({
      id: d.id,
      challenge_mode_id: d.challenge_mode_id,
      slug: d.slug,
      name: d.name,
      short_name: d.short_name,
      keystone_timer_seconds: d.keystone_timer_seconds,
      icon_url: d.icon_url,
      background_image_url: d.background_image_url,
    })),
  }));
}
