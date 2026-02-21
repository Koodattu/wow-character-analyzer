// ─── WarcraftLogs API v2 Client (GraphQL) ──────────────────────────────
import { rateLimitManager } from "./rate-limiter";
import { log as rootLog } from "../lib/logger";

const log = rootLog.child({ module: "wcl" });

const WCL_CLIENT_ID = process.env.WCL_CLIENT_ID ?? "";
const WCL_CLIENT_SECRET = process.env.WCL_CLIENT_SECRET ?? "";
const WCL_API_URL = "https://www.warcraftlogs.com/api/v2/client";
const WCL_TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const API_DELAY_MS = 200;

let accessToken: string | null = null;
let tokenExpiresAt = 0;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
    return accessToken;
  }

  const response = await fetch(WCL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${WCL_CLIENT_ID}:${WCL_CLIENT_SECRET}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`WCL auth failed: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return accessToken!;
}

// ─── GraphQL Query Executor ────────────────────────────────────────────
export async function wclQuery<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
  const token = await getAccessToken();
  rateLimitManager.trackRequest("wcl");
  await sleep(API_DELAY_MS);

  const response = await fetch(WCL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  // Track rate limits from headers
  const remaining = response.headers.get("x-ratelimit-remaining");
  const limit = response.headers.get("x-ratelimit-limit");
  const resetAt = response.headers.get("x-ratelimit-reset");

  if (remaining && limit) {
    rateLimitManager.update("wcl", parseFloat(remaining), parseFloat(limit), resetAt ? parseInt(resetAt) * 1000 : undefined);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WCL API error: ${response.status} ${text}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`WCL GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

// ─── Encounter Rankings (Lightweight Scan) ─────────────────────────────
export interface WclEncounterRanking {
  encounterID: number;
  encounterName: string;
  difficulty: number;
  totalKills: number;
  ranks: Array<{
    rankPercent: number;
    amount: number; // DPS or HPS
    spec: string;
    reportCode: string;
    fightID: number;
    startTime: number;
    duration: number;
    bracketData: number; // ilvl
  }>;
  medianPercent: number;
  bestAmount: number;
  fastestKill: number;
}

export async function fetchEncounterRankings(
  characterName: string,
  serverSlug: string,
  serverRegion: string,
  encounterId: number,
  difficulty: number = 5, // Mythic
): Promise<WclEncounterRanking | null> {
  const query = `
    query ($name: String!, $server: String!, $region: String!, $encounterId: Int!, $difficulty: Int!) {
      characterData {
        character(name: $name, serverSlug: $server, serverRegion: $region) {
          encounterRankings(
            encounterID: $encounterId
            difficulty: $difficulty
          )
        }
      }
    }
  `;

  try {
    const data = await wclQuery(query, {
      name: characterName,
      server: serverSlug,
      region: serverRegion,
      encounterId,
      difficulty,
    });

    const rankings = data?.characterData?.character?.encounterRankings;
    if (!rankings) return null;

    return rankings;
  } catch (error) {
    log.error({ err: error, characterName, encounterId }, "Failed to fetch WCL rankings");
    return null;
  }
}

// ─── Batched Encounter Rankings (Efficient Lightweight Scan) ───────────
// Fetches ALL encounters for a raid zone in a single GraphQL query using
// aliases. This is dramatically more efficient than one query per boss.

const MAX_ENCOUNTERS_PER_BATCH = 12; // WCL handles ~12 aliases well

/**
 * Fetch encounter rankings for multiple encounters in a single GraphQL query.
 * Uses aliases to batch up to MAX_ENCOUNTERS_PER_BATCH encounters per request.
 * Returns a Map of encounterId → WclEncounterRanking.
 */
export async function fetchBatchedEncounterRankings(
  characterName: string,
  serverSlug: string,
  serverRegion: string,
  encounterIds: number[],
  difficulty: number = 5,
): Promise<Map<number, WclEncounterRanking>> {
  if (encounterIds.length === 0) return new Map();

  const results = new Map<number, WclEncounterRanking>();

  // Batch encounters into groups
  for (let i = 0; i < encounterIds.length; i += MAX_ENCOUNTERS_PER_BATCH) {
    const batch = encounterIds.slice(i, i + MAX_ENCOUNTERS_PER_BATCH);

    const aliasFields = batch.map((id) => `e${id}: encounterRankings(encounterID: ${id}, difficulty: ${difficulty})`).join("\n          ");

    const query = `
      query ($name: String!, $server: String!, $region: String!) {
        characterData {
          character(name: $name, serverSlug: $server, serverRegion: $region) {
            ${aliasFields}
          }
        }
      }
    `;

    try {
      const data = await wclQuery(query, {
        name: characterName,
        server: serverSlug,
        region: serverRegion,
      });

      const character = data?.characterData?.character;
      if (!character) {
        log.warn({ characterName, serverSlug, batchSize: batch.length }, "Character not found on WCL");
        continue;
      }

      for (const encounterId of batch) {
        const rankings = character[`e${encounterId}`];
        if (rankings && rankings.totalKills > 0) {
          results.set(encounterId, rankings);
        }
      }

      log.debug(
        { characterName, batchIndex: Math.floor(i / MAX_ENCOUNTERS_PER_BATCH), encounterCount: batch.length, resultsCount: results.size },
        "Batched WCL rankings fetch complete",
      );
    } catch (error) {
      log.error({ err: error, characterName, batchSize: batch.length }, "Batched WCL rankings fetch failed");
    }
  }

  return results;
}

// ─── Report Details (Deep Scan) ────────────────────────────────────────
export interface WclReportFight {
  id: number;
  encounterID: number;
  name: string;
  difficulty: number;
  kill: boolean;
  startTime: number;
  endTime: number;
}

export async function fetchReportFights(reportCode: string): Promise<WclReportFight[]> {
  const query = `
    query ($code: String!) {
      reportData {
        report(code: $code) {
          title
          guild { name }
          startTime
          endTime
          zone { id }
          fights(killType: Encounters) {
            id
            encounterID
            name
            difficulty
            kill
            startTime
            endTime
          }
        }
      }
    }
  `;

  const data = await wclQuery(query, { code: reportCode });
  return data?.reportData?.report?.fights ?? [];
}

export interface WclReportMeta {
  title: string;
  guildName: string | null;
  startTime: number;
  endTime: number;
  zoneId: number | null;
}

export async function fetchReportMeta(reportCode: string): Promise<WclReportMeta | null> {
  const query = `
    query ($code: String!) {
      reportData {
        report(code: $code) {
          title
          guild { name }
          startTime
          endTime
          zone { id }
        }
      }
    }
  `;

  const data = await wclQuery(query, { code: reportCode });
  const report = data?.reportData?.report;
  if (!report) return null;

  return {
    title: report.title,
    guildName: report.guild?.name ?? null,
    startTime: report.startTime,
    endTime: report.endTime,
    zoneId: report.zone?.id ?? null,
  };
}

// ─── Death Events (Deep Scan) ──────────────────────────────────────────
export interface WclDeathEvent {
  timestamp: number;
  sourceID: number | null;
  sourceName: string | null;
  targetID: number;
  targetName: string;
  ability: { name: string; guid: number } | null;
  deathOrder: number;
}

export async function fetchFightDeaths(reportCode: string, fightId: number): Promise<WclDeathEvent[]> {
  const query = `
    query ($code: String!, $fightId: Int!) {
      reportData {
        report(code: $code) {
          events(
            fightIDs: [$fightId]
            dataType: Deaths
            limit: 50
          ) {
            data
          }
        }
      }
    }
  `;

  const data = await wclQuery(query, { code: reportCode, fightId });
  const events = data?.reportData?.report?.events?.data ?? [];

  return events.map((e: any, index: number) => ({
    timestamp: e.timestamp,
    sourceID: e.sourceID ?? null,
    sourceName: e.source?.name ?? null,
    targetID: e.targetID,
    targetName: e.target?.name ?? e.targetName ?? "Unknown",
    ability: e.ability ? { name: e.ability.name, guid: e.ability.guid } : null,
    deathOrder: index + 1,
  }));
}

// ─── Cast Events (Deep Scan) ───────────────────────────────────────────
export interface WclCastEvent {
  timestamp: number;
  sourceID: number;
  sourceName: string;
  abilityGameID: number;
  abilityName: string;
}

export async function fetchFightCasts(reportCode: string, fightId: number, abilityIds: number[]): Promise<WclCastEvent[]> {
  if (abilityIds.length === 0) return [];

  const query = `
    query ($code: String!, $fightId: Int!, $abilityIds: [Int!]) {
      reportData {
        report(code: $code) {
          events(
            fightIDs: [$fightId]
            dataType: Casts
            abilityID: $abilityIds
            limit: 500
          ) {
            data
          }
        }
      }
    }
  `;

  const data = await wclQuery(query, {
    code: reportCode,
    fightId,
    abilityIds,
  });

  const events = data?.reportData?.report?.events?.data ?? [];

  return events.map((e: any) => ({
    timestamp: e.timestamp,
    sourceID: e.sourceID,
    sourceName: e.source?.name ?? "Unknown",
    abilityGameID: e.ability?.guid ?? e.abilityGameID,
    abilityName: e.ability?.name ?? "Unknown",
  }));
}

// ─── Zone Queries (Raid Sync) ──────────────────────────────────────────

export interface WclZoneSummary {
  id: number;
  name: string;
}

let zonesCache: { data: WclZoneSummary[]; fetchedAt: number } | null = null;
const ZONES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch all available WCL raid zones.
 * Cached in-memory for 24 hours since zones rarely change.
 */
export async function fetchWclZones(): Promise<WclZoneSummary[]> {
  if (zonesCache && Date.now() - zonesCache.fetchedAt < ZONES_CACHE_TTL) {
    return zonesCache.data;
  }

  const query = `
    query {
      rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
      worldData {
        zones { id name }
      }
    }
  `;

  const data = await wclQuery(query);
  const zones: WclZoneSummary[] = (data?.worldData?.zones ?? []).map((z: any) => ({
    id: z.id,
    name: z.name,
  }));

  zonesCache = { data: zones, fetchedAt: Date.now() };
  log.info({ zoneCount: zones.length }, "Fetched WCL zones");
  return zones;
}

export interface WclZoneDetail {
  id: number;
  name: string;
  frozen: boolean;
  expansion: { id: number; name: string } | null;
  encounters: Array<{ id: number; name: string; journalID: number }>;
  partitions: Array<{ id: number; name: string; default: boolean }>;
}

/**
 * Fetch full detail for a specific WCL zone: encounters, partitions, expansion info.
 * Not cached in-memory — the api_cache DB table handles persistence.
 */
export async function fetchWclZoneDetail(zoneId: number): Promise<WclZoneDetail | null> {
  const query = `
    query ($zoneId: Int!) {
      rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
      worldData {
        zone(id: $zoneId) {
          id
          name
          frozen
          expansion { id name }
          encounters { id name journalID }
          partitions { id name default }
        }
      }
    }
  `;

  try {
    const data = await wclQuery(query, { zoneId });
    const zone = data?.worldData?.zone;
    if (!zone) {
      log.warn({ zoneId }, "WCL zone not found");
      return null;
    }

    return {
      id: zone.id,
      name: zone.name,
      frozen: zone.frozen ?? false,
      expansion: zone.expansion ? { id: zone.expansion.id, name: zone.expansion.name } : null,
      encounters: (zone.encounters ?? []).map((e: any) => ({ id: e.id, name: e.name, journalID: e.journalID ?? 0 })),
      partitions: (zone.partitions ?? []).map((p: any) => ({ id: p.id, name: p.name, default: p.default ?? false })),
    };
  } catch (error) {
    log.error({ err: error, zoneId }, "Failed to fetch WCL zone detail");
    return null;
  }
}

// ─── Character Existence Check ─────────────────────────────────────────
export async function checkCharacterExists(characterName: string, serverSlug: string, serverRegion: string): Promise<boolean> {
  const query = `
    query ($name: String!, $server: String!, $region: String!) {
      characterData {
        character(name: $name, serverSlug: $server, serverRegion: $region) {
          id
          name
        }
      }
    }
  `;

  try {
    const data = await wclQuery(query, {
      name: characterName,
      server: serverSlug,
      region: serverRegion,
    });
    return !!data?.characterData?.character;
  } catch {
    return false;
  }
}
