// ─── Raider.IO API Client ──────────────────────────────────────────────
import { rateLimitManager } from "./rate-limiter";

const RAIDERIO_BASE = "https://raider.io/api/v1";
const API_DELAY_MS = 200;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function raiderioFetch(url: string): Promise<any> {
  rateLimitManager.trackRequest("raiderio");
  await sleep(API_DELAY_MS);

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 400 || response.status === 404) return null;
    throw new Error(`Raider.IO API error: ${response.status} ${url}`);
  }

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
