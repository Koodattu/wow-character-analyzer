// ─── Profile Computation ───────────────────────────────────────────────
// Computes character_profiles and character_boss_stats from raw data
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { characters, characterProfiles, characterBossStats, wclParses, wclDeaths, wclCasts, raiderioScores, raiderioRuns } from "../db/schema";
import { getParseTier } from "../utils/parse-tiers";
import { log as rootLog } from "../lib/logger";

const log = rootLog.child({ module: "processing" });
export async function computeCharacterProfile(characterId: string): Promise<void> {
  log.debug({ characterId }, "Computing profile");

  // Fetch all raw data
  const [parsesData, deathsData, castsData, scoresData, runsData] = await Promise.all([
    db.select().from(wclParses).where(eq(wclParses.characterId, characterId)),
    db.select().from(wclDeaths).where(eq(wclDeaths.characterId, characterId)),
    db.select().from(wclCasts).where(eq(wclCasts.characterId, characterId)),
    db.select().from(raiderioScores).where(eq(raiderioScores.characterId, characterId)),
    db.select().from(raiderioRuns).where(eq(raiderioRuns.characterId, characterId)),
  ]);

  // ── Raid Stats ──────────────────────────────────────────────────────
  const kills = parsesData.filter((p) => p.killOrWipe === true);
  const wipes = parsesData.filter((p) => p.killOrWipe === false);
  const parseValues = kills.map((k) => k.percentile).filter((p): p is number => p !== null);

  const avgParse = parseValues.length > 0 ? parseValues.reduce((a, b) => a + b, 0) / parseValues.length : null;

  const sortedParses = [...parseValues].sort((a, b) => a - b);
  const medianParse = sortedParses.length > 0 ? sortedParses[Math.floor(sortedParses.length / 2)] : null;

  const bestParse = sortedParses.length > 0 ? sortedParses[sortedParses.length - 1] : null;

  // ── Death Stats ─────────────────────────────────────────────────────
  const totalDeaths = deathsData.length;
  const avgDeathsPerKill = kills.length > 0 ? totalDeaths / kills.length : null;

  // First death rate: % of fights where this character died first
  const firstDeaths = deathsData.filter((d) => d.deathOrder === 1);
  const firstDeathRate = kills.length > 0 ? (firstDeaths.length / kills.length) * 100 : null;

  // Average time of death
  const deathTimestamps = deathsData.map((d) => d.timestamp).filter((t): t is number => t !== null);
  const avgTimeOfDeath = deathTimestamps.length > 0 ? deathTimestamps.reduce((a, b) => a + b, 0) / deathTimestamps.length : null;

  // ── Defensive/Consumable Stats ──────────────────────────────────────
  const defensiveCasts = castsData.filter((c) => c.type === "defensive");
  const healthstoneCasts = castsData.filter((c) => c.type === "healthstone");
  const healthPotionCasts = castsData.filter((c) => c.type === "health_potion");

  const defensiveUsageRate = kills.length > 0 ? (new Set(defensiveCasts.map((c) => c.fightId)).size / kills.length) * 100 : null;

  const healthstoneUsageRate = kills.length > 0 ? (new Set(healthstoneCasts.map((c) => c.fightId)).size / kills.length) * 100 : null;

  const healthPotionUsageRate = kills.length > 0 ? (new Set(healthPotionCasts.map((c) => c.fightId)).size / kills.length) * 100 : null;

  // ── M+ Stats ────────────────────────────────────────────────────────
  // Get current season score (most recent)
  const currentScore = scoresData.length > 0 ? scoresData.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))[0] : null;

  const totalRuns = runsData.length;
  const timedRuns = runsData.filter((r) => r.timed).length;
  const timedRate = totalRuns > 0 ? (timedRuns / totalRuns) * 100 : null;

  // ── Parse Tier ──────────────────────────────────────────────────────
  const parseTier = getParseTier(medianParse).tier;

  // ── Upsert Profile ─────────────────────────────────────────────────
  const profileData = {
    characterId,
    totalKills: kills.length,
    totalWipes: wipes.length,
    avgParse,
    medianParse,
    bestParse,
    totalDeaths,
    avgDeathsPerKill,
    firstDeathRate,
    avgTimeOfDeath,
    defensiveUsageRate,
    healthstoneUsageRate,
    healthPotionUsageRate,
    currentMplusScore: currentScore?.overallScore ?? null,
    totalRuns,
    timedRate,
    parseTier,
    processingTier: "lightweight" as const,
  };

  const [existing] = await db.select().from(characterProfiles).where(eq(characterProfiles.characterId, characterId)).limit(1);

  if (existing) {
    await db.update(characterProfiles).set(profileData).where(eq(characterProfiles.characterId, characterId));
  } else {
    await db.insert(characterProfiles).values(profileData);
  }

  log.info({ characterId, kills: kills.length, avgParse: avgParse?.toFixed(1) }, "Profile computed");
}

// ─── Per-Boss Stats Computation ────────────────────────────────────────
export async function computeBossStats(characterId: string): Promise<void> {
  log.debug({ characterId }, "Computing boss stats");

  const parsesData = await db.select().from(wclParses).where(eq(wclParses.characterId, characterId));

  // Group parses by encounter
  const byEncounter = new Map<number, typeof parsesData>();
  for (const parse of parsesData) {
    const key = parse.encounterId;
    if (!byEncounter.has(key)) byEncounter.set(key, []);
    byEncounter.get(key)!.push(parse);
  }

  for (const [encounterId, parses] of byEncounter) {
    const kills = parses.filter((p) => p.killOrWipe === true);
    const parseValues = kills.map((k) => k.percentile).filter((p): p is number => p !== null);

    const sorted = [...parseValues].sort((a, b) => a - b);
    const bestParse = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    const worstParse = sorted.length > 0 ? sorted[0] : null;
    const medianParse = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
    const avgParse = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null;

    // Get the encounter name from the first parse
    const encounterName = parses[0]?.spec ?? `Encounter ${encounterId}`;

    const bossStatsData = {
      characterId,
      encounterId,
      bossName: encounterName,
      kills: kills.length,
      bestParse,
      medianParse,
      worstParse,
      avgParse,
      totalDeaths: 0,
      avgDeathsPerKill: null as number | null,
      firstDeathRate: null as number | null,
      avgTimeOfDeath: null as number | null,
      defensiveUsageRate: null as number | null,
      healthstoneUsageRate: null as number | null,
      healthPotionUsageRate: null as number | null,
      parseTier: getParseTier(medianParse).tier,
    };

    // Upsert boss stats
    const [existing] = await db
      .select()
      .from(characterBossStats)
      .where(and(eq(characterBossStats.characterId, characterId), eq(characterBossStats.encounterId, encounterId)))
      .limit(1);

    if (existing) {
      await db.update(characterBossStats).set(bossStatsData).where(eq(characterBossStats.id, existing.id));
    } else {
      await db.insert(characterBossStats).values(bossStatsData);
    }
  }

  log.info({ characterId, encounters: byEncounter.size }, "Boss stats computed");
}
