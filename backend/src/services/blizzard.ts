// ─── Blizzard API Client ───────────────────────────────────────────────
import { rateLimitManager } from "./rate-limiter";

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

  const response = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${BLIZZARD_CLIENT_ID}:${BLIZZARD_CLIENT_SECRET}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Blizzard auth failed: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return accessToken!;
}

async function blizzardFetch(url: string): Promise<any> {
  const token = await getAccessToken();
  rateLimitManager.trackRequest("blizzard");
  await sleep(API_DELAY_MS);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Blizzard API error: ${response.status} ${url}`);
  }

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

export async function fetchCharacterProfile(realmSlug: string, characterName: string, region: string = "eu"): Promise<BlizzardCharacterProfile | null> {
  const name = characterName.toLowerCase();
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${name}?namespace=profile-${region}&locale=en_US`;
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
  const name = characterName.toLowerCase();
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${name}/character-media?namespace=profile-${region}&locale=en_US`;
  return blizzardFetch(url);
}

// ─── Achievements ──────────────────────────────────────────────────────
export interface BlizzardAchievement {
  id: number;
  achievement: { id: number; name: string };
  completed_timestamp: number;
}

// Well-known Cutting Edge / AotC achievement IDs
const CUTTING_EDGE_IDS = new Set([
  // TWW
  20590, // CE: Queen Ansurek
  // DF
  19350, // CE: Fyrakk
  18254, // CE: Scalecommander Sarkareth
  17108, // CE: Raszageth
]);

const AOTC_IDS = new Set([
  // TWW
  20589, // AotC: Queen Ansurek
  // DF
  19349, // AotC: Fyrakk
  18253, // AotC: Scalecommander Sarkareth
  17107, // AotC: Raszageth
]);

export async function fetchCharacterAchievements(realmSlug: string, characterName: string, region: string = "eu"): Promise<BlizzardAchievement[]> {
  const name = characterName.toLowerCase();
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${name}/achievements?namespace=profile-${region}&locale=en_US`;
  const data = await blizzardFetch(url);

  if (!data?.achievements) return [];

  // Filter for CE and AotC achievements
  const relevant = data.achievements.filter((a: any) => CUTTING_EDGE_IDS.has(a.achievement?.id) || AOTC_IDS.has(a.achievement?.id));

  return relevant.map((a: any) => ({
    id: a.id,
    achievement: { id: a.achievement.id, name: a.achievement.name },
    completed_timestamp: a.completed_timestamp,
  }));
}

export function getAchievementType(achievementId: number): "cutting_edge" | "ahead_of_the_curve" | null {
  if (CUTTING_EDGE_IDS.has(achievementId)) return "cutting_edge";
  if (AOTC_IDS.has(achievementId)) return "ahead_of_the_curve";
  return null;
}

// ─── User Character List (requires user OAuth token) ───────────────────
export interface BlizzardWowCharacter {
  character: {
    id: number;
    name: string;
    realm: { slug: string; name: string };
  };
  faction: { type: string };
  playable_class: { name: string };
  level: number;
}

export async function fetchUserCharacters(userAccessToken: string, region: string = "eu"): Promise<BlizzardWowCharacter[]> {
  await sleep(API_DELAY_MS);

  const url = `https://${region}.api.blizzard.com/profile/user/wow?namespace=profile-${region}&locale=en_US`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user characters: ${response.status}`);
  }

  const data = await response.json();
  return data.wow_accounts?.flatMap((account: any) => account.characters ?? []) ?? [];
}
