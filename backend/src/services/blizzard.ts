// ─── Blizzard API Client ───────────────────────────────────────────────
import { rateLimitManager } from "./rate-limiter";
import { log as rootLog } from "../lib/logger";

const log = rootLog.child({ module: "blizzard" });

const BLIZZARD_CLIENT_ID = process.env.BLIZZARD_CLIENT_ID ?? "";
const BLIZZARD_CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET ?? "";
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

  log.debug("Fetching new Blizzard API access token");
  const response = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${BLIZZARD_CLIENT_ID}:${BLIZZARD_CLIENT_SECRET}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    log.error({ status: response.status }, "Blizzard auth failed");
    throw new Error(`Blizzard auth failed: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  log.debug({ expiresIn: data.expires_in }, "Blizzard API token obtained");
  return accessToken!;
}

async function blizzardFetch(url: string): Promise<any> {
  const token = await getAccessToken();
  rateLimitManager.trackRequest("blizzard");
  await sleep(API_DELAY_MS);

  log.debug({ url }, "Blizzard API request");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 404) {
      log.debug({ url, status: 404 }, "Blizzard API: resource not found");
      return null;
    }
    log.error({ url, status: response.status }, "Blizzard API error");
    throw new Error(`Blizzard API error: ${response.status} ${url}`);
  }

  log.debug({ url, status: response.status }, "Blizzard API success");
  return response.json();
}

// ─── Character Profile ─────────────────────────────────────────────────
export interface BlizzardCharacterProfile {
  id: number;
  name: string;
  race: { name: string };
  character_class: { name: string };
  active_spec?: { name: string };
  faction: { type: string; name: string };
  guild?: { name: string };
  realm: { slug: string; name: string };
  level: number;
}

function normalizePathParts(realmSlug: string, characterName: string) {
  const safeRealm = realmSlug?.trim().toLowerCase();
  const safeName = characterName?.trim().toLowerCase();

  if (!safeRealm || !safeName) {
    log.warn({ realmSlug, characterName }, "Skipping Blizzard request due to missing character path parameters");
    return null;
  }

  return { safeRealm, safeName };
}

export async function fetchCharacterProfile(realmSlug: string, characterName: string, region: string = "eu"): Promise<BlizzardCharacterProfile | null> {
  const parts = normalizePathParts(realmSlug, characterName);
  if (!parts) return null;

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${parts.safeRealm}/${parts.safeName}?namespace=profile-${region}&locale=en_US`;
  return blizzardFetch(url);
}

// ─── Character Media ───────────────────────────────────────────────────
export interface BlizzardCharacterMedia {
  assets?: Array<{ key: string; value: string }>;
  avatar_url?: string;
  bust_url?: string;
  render_url?: string;
}

export async function fetchCharacterMedia(realmSlug: string, characterName: string, region: string = "eu"): Promise<BlizzardCharacterMedia | null> {
  const parts = normalizePathParts(realmSlug, characterName);
  if (!parts) return null;

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${parts.safeRealm}/${parts.safeName}/character-media?namespace=profile-${region}&locale=en_US`;
  return blizzardFetch(url);
}

// ─── Achievements ──────────────────────────────────────────────────────
export interface BlizzardAchievement {
  id: number;
  achievement: { id: number; name: string };
  completed_timestamp: number;
}

const CUTTING_EDGE_PHRASE = "cutting edge";
const AOTC_PHRASE = "ahead of the curve";

export async function fetchCharacterAchievements(realmSlug: string, characterName: string, region: string = "eu"): Promise<BlizzardAchievement[]> {
  const parts = normalizePathParts(realmSlug, characterName);
  if (!parts) return [];

  const url = `https://${region}.api.blizzard.com/profile/wow/character/${parts.safeRealm}/${parts.safeName}/achievements?namespace=profile-${region}&locale=en_US`;
  const data = await blizzardFetch(url);

  if (!data?.achievements) return [];

  // Filter for CE and AotC achievements using achievement names
  const relevant = data.achievements.filter((a: any) => {
    const name = a.achievement?.name;
    if (typeof name !== "string") return false;
    const lower = name.toLowerCase();
    return lower.includes(CUTTING_EDGE_PHRASE) || lower.includes(AOTC_PHRASE);
  });

  return relevant.map((a: any) => ({
    id: a.id,
    achievement: { id: a.achievement.id, name: a.achievement.name },
    completed_timestamp: a.completed_timestamp,
  }));
}

export function getAchievementType(achievementName: string | null | undefined): "cutting_edge" | "ahead_of_the_curve" | null {
  if (!achievementName) return null;

  const lowerName = achievementName.toLowerCase();
  if (lowerName.includes(CUTTING_EDGE_PHRASE)) return "cutting_edge";
  if (lowerName.includes(AOTC_PHRASE)) return "ahead_of_the_curve";
  return null;
}

// ─── Achievement Index (for Icon Resolution) ──────────────────────────

interface AchievementIndexEntry {
  id: number;
  name: string;
}

let achievementIndexCache: { data: AchievementIndexEntry[]; fetchedAt: number } | null = null;
const ACHIEVEMENT_INDEX_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch all WoW achievements from the Blizzard static data API.
 * Cached in-memory for 24 hours. Only used during raid sync for icon resolution.
 */
export async function fetchAchievementIndex(): Promise<AchievementIndexEntry[]> {
  if (achievementIndexCache && Date.now() - achievementIndexCache.fetchedAt < ACHIEVEMENT_INDEX_TTL) {
    return achievementIndexCache.data;
  }

  const url = `https://us.api.blizzard.com/data/wow/achievement/index?namespace=static-us&locale=en_US`;
  const data = await blizzardFetch(url);
  if (!data?.achievements) {
    log.warn("No achievements returned from Blizzard achievement index");
    return [];
  }

  const entries: AchievementIndexEntry[] = data.achievements.map((a: any) => ({
    id: a.id,
    name: a.name ?? "",
  }));

  achievementIndexCache = { data: entries, fetchedAt: Date.now() };
  log.info({ count: entries.length }, "Fetched Blizzard achievement index");
  return entries;
}

/**
 * Fetch the media (icon CDN URL) for a specific achievement.
 * Returns the CDN URL string or null on failure.
 */
export async function fetchAchievementMedia(achievementId: number): Promise<string | null> {
  const url = `https://us.api.blizzard.com/data/wow/media/achievement/${achievementId}?namespace=static-us&locale=en_US`;
  const data = await blizzardFetch(url);
  if (!data?.assets?.length) return null;

  // Find the first icon asset
  const iconAsset = data.assets.find((a: any) => a.key === "icon");
  return iconAsset?.value ?? data.assets[0]?.value ?? null;
}

/**
 * Build a name-to-id Map from the achievement index for fast lookups.
 */
export function buildAchievementLookup(index: AchievementIndexEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of index) {
    map.set(entry.name.toLowerCase(), entry.id);
  }
  return map;
}

/**
 * Find a Blizzard CDN icon URL for a boss by searching achievement names.
 *
 * Search order (first match wins):
 *   1. Exact: "Mythic: {bossName}"
 *   2. Partial: achievement name contains bossName
 *   3. First-part-before-comma: for bosses like "Mug'Zee, Heads of Security" → search "Mug'Zee"
 *
 * Returns the CDN URL or null if no match found.
 */
export async function findBossIconUrl(bossName: string, achievementIndex: AchievementIndexEntry[]): Promise<string | null> {
  const lowerBoss = bossName.toLowerCase();

  // Strategy 1: Exact "Mythic: <bossName>"
  const mythicExact = achievementIndex.find((a) => a.name.toLowerCase() === `mythic: ${lowerBoss}`);
  if (mythicExact) {
    return fetchAchievementMedia(mythicExact.id);
  }

  // Strategy 2: Achievement name contains boss name
  const partialMatch = achievementIndex.find((a) => a.name.toLowerCase().includes(lowerBoss));
  if (partialMatch) {
    return fetchAchievementMedia(partialMatch.id);
  }

  // Strategy 3: First part before comma
  if (bossName.includes(",")) {
    const firstPart = bossName.split(",")[0].trim().toLowerCase();
    const commaMatch = achievementIndex.find((a) => a.name.toLowerCase().includes(firstPart));
    if (commaMatch) {
      return fetchAchievementMedia(commaMatch.id);
    }
  }

  // Strategy 4: First word only (for very long boss names)
  const firstWord = lowerBoss.split(/\s+/)[0];
  if (firstWord && firstWord !== lowerBoss && firstWord.length > 3) {
    const wordMatch = achievementIndex.find((a) => a.name.toLowerCase().includes(`mythic: ${firstWord}`) || a.name.toLowerCase().includes(firstWord));
    if (wordMatch) {
      return fetchAchievementMedia(wordMatch.id);
    }
  }

  log.debug({ bossName }, "No achievement icon match found for boss");
  return null;
}

/**
 * Find a Blizzard CDN icon URL for a raid by searching achievement names.
 * Searches for raid-related achievements (e.g., "Ahead of the Curve: <raidName>").
 */
export async function findRaidIconUrl(raidName: string, achievementIndex: AchievementIndexEntry[]): Promise<string | null> {
  const lowerRaid = raidName.toLowerCase();

  // Strategy 1: AotC or CE achievement mentioning the raid
  const aotcMatch = achievementIndex.find(
    (a) => (a.name.toLowerCase().includes("ahead of the curve") || a.name.toLowerCase().includes("cutting edge")) && a.name.toLowerCase().includes(lowerRaid),
  );
  if (aotcMatch) {
    return fetchAchievementMedia(aotcMatch.id);
  }

  // Strategy 2: Any achievement containing the raid name
  const partialMatch = achievementIndex.find((a) => a.name.toLowerCase().includes(lowerRaid));
  if (partialMatch) {
    return fetchAchievementMedia(partialMatch.id);
  }

  log.debug({ raidName }, "No achievement icon match found for raid");
  return null;
}

// ─── User Character List (requires user OAuth token) ───────────────────
export interface BlizzardWowCharacter {
  id: number;
  name: string;
  realm: { slug: string; name: string; id: number; key: { href: string } };
  faction: { type: string; name: string };
  playable_class: { name: string; id: number; key: { href: string } };
  playable_race: { name: string; id: number; key: { href: string } };
  gender: { type: string; name: string };
  level: number;
  character: { href: string };
  protected_character: { href: string };
}

export async function fetchUserCharacters(userAccessToken: string, region: string = "eu"): Promise<BlizzardWowCharacter[]> {
  await sleep(API_DELAY_MS);

  const url = `https://${region}.api.blizzard.com/profile/user/wow?namespace=profile-${region}&locale=en_US`;
  log.debug({ url }, "Fetching user WoW characters");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });

  if (!response.ok) {
    log.error({ status: response.status }, "Failed to fetch user characters");
    throw new Error(`Failed to fetch user characters: ${response.status}`);
  }

  const data = await response.json();
  const characters = data.wow_accounts?.flatMap((account: any) => account.characters ?? []) ?? [];
  log.info({ count: characters.length, accounts: data.wow_accounts?.length ?? 0 }, "Fetched user WoW characters");
  return characters;
}
