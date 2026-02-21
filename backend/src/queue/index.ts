// ─── BunQueue Setup ────────────────────────────────────────────────────
// Embedded job queue with SQLite persistence — no Redis required
import { Queue, Worker } from "bunqueue/client";
import type { Job } from "bunqueue/client";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { characters, processingState, characterQueue, wclParses, raiderioScores, raiderioRuns, blizzardAchievements, bosses, raids, seasons } from "../db/schema";
import { fetchCharacterProfile, fetchCharacterMedia, fetchCharacterAchievements, getAchievementType } from "../services/blizzard";
import { fetchBatchedEncounterRankings } from "../services/warcraftlogs";
import { fetchRaiderioCharacter, fetchRaiderioHistoricalScores, fetchRaiderioSeasonBestRuns } from "../services/raiderio";
import { computeCharacterProfile, computeBossStats } from "../processing/profile";
import { generateAiSummary } from "../processing/ai-summary";
import { rateLimitManager } from "../services/rate-limiter";
import { SEASONS, getAllRioSeasonSlugs } from "../config/raids";
import { log as rootLog } from "../lib/logger";
import { publishProcessingUpdate, publishUserQueuedUpdate } from "../lib/sse";

const log = rootLog.child({ module: "queue" });

function broadcastQueueStateChange() {
  publishProcessingUpdate();
  publishUserQueuedUpdate();
}
// ─── Queue Configuration ───────────────────────────────────────────────

const lightweightQueue = new Queue("lightweight-scan", {
  embedded: true,
});

const deepScanQueue = new Queue("deep-scan", {
  embedded: true,
});

// ─── Step Tracking Helpers ─────────────────────────────────────────────
async function updateStep(characterId: string, step: string, status: "in_progress" | "completed" | "failed" = "in_progress") {
  const [current] = await db.select().from(processingState).where(eq(processingState.characterId, characterId)).limit(1);

  const stepsCompleted = (current?.stepsCompleted as string[]) ?? [];
  if (status === "completed" && !stepsCompleted.includes(step)) {
    stepsCompleted.push(step);
  }

  await db
    .update(processingState)
    .set({
      currentStep: step,
      stepsCompleted,
      lightweightStatus: status === "failed" ? "failed" : (current?.lightweightStatus ?? "in_progress"),
    })
    .where(eq(processingState.characterId, characterId));

  broadcastQueueStateChange();
}

// ─── Tracked Boss Encounter IDs (Grouped by Zone) ─────────────────────
// Returns encounters grouped by WCL zone for efficient batched queries.

interface ZoneEncounters {
  zoneId: number;
  zoneName: string;
  raidDbId: string;
  encounterIds: number[];
}

async function getTrackedEncountersByZone(): Promise<ZoneEncounters[]> {
  const rows = await db
    .select({
      wclEncounterId: bosses.wclEncounterId,
      raidId: bosses.raidId,
      raidName: raids.name,
      wclZoneId: raids.wclZoneId,
    })
    .from(bosses)
    .innerJoin(raids, eq(bosses.raidId, raids.id))
    .innerJoin(seasons, eq(raids.seasonId, seasons.id))
    .where(isNotNull(bosses.wclEncounterId));

  // Group by zone
  const zoneMap = new Map<number, ZoneEncounters>();
  for (const row of rows) {
    if (!row.wclZoneId || !row.wclEncounterId) continue;
    if (!zoneMap.has(row.wclZoneId)) {
      zoneMap.set(row.wclZoneId, {
        zoneId: row.wclZoneId,
        zoneName: row.raidName,
        raidDbId: row.raidId,
        encounterIds: [],
      });
    }
    zoneMap.get(row.wclZoneId)!.encounterIds.push(row.wclEncounterId);
  }

  const zones = [...zoneMap.values()];
  if (zones.length === 0) {
    log.warn("No tracked encounter IDs found in DB — has raid sync run?");
  } else {
    log.debug({ zoneCount: zones.length, totalEncounters: zones.reduce((s, z) => s + z.encounterIds.length, 0) }, "Loaded tracked encounters by zone");
  }

  return zones;
}

// ─── Lightweight Scan Worker ───────────────────────────────────────────
const lightweightWorker = new Worker(
  "lightweight-scan",
  async (job: Job) => {
    const { characterId, characterName, realmSlug, region } = job.data as {
      characterId: string;
      characterName: string;
      realmSlug: string;
      region: string;
    };

    log.info({ characterId, characterName, realmSlug }, "Lightweight scan started");

    // ── Idempotency guard: skip if already completed ──────────
    const [existingState] = await db
      .select({ lightweightStatus: processingState.lightweightStatus })
      .from(processingState)
      .where(eq(processingState.characterId, characterId))
      .limit(1);

    if (existingState?.lightweightStatus === "completed") {
      log.info({ characterId, characterName }, "Lightweight scan already completed — skipping duplicate job");
      return;
    }

    try {
      // Update status
      await db
        .update(processingState)
        .set({ lightweightStatus: "in_progress", currentStep: "Starting...", errorMessage: null })
        .where(eq(processingState.characterId, characterId));
      broadcastQueueStateChange();

      await db.update(characterQueue).set({ status: "processing" }).where(eq(characterQueue.characterId, characterId));
      broadcastQueueStateChange();

      // ── Step 1: Blizzard Profile ───────────────────────────────
      await updateStep(characterId, "Fetching Blizzard profile");
      const blizzProfile = await fetchCharacterProfile(realmSlug, characterName, region);
      const blizzMedia = await fetchCharacterMedia(realmSlug, characterName, region);

      if (blizzProfile) {
        const profilePicUrl = blizzMedia?.assets?.find((a) => a.key === "avatar")?.value ?? blizzMedia?.avatar_url ?? null;

        await db
          .update(characters)
          .set({
            className: blizzProfile.character_class?.name ?? null,
            specName: blizzProfile.active_spec?.name ?? null,
            race: blizzProfile.race?.name ?? null,
            faction: blizzProfile.faction?.type?.toLowerCase() ?? null,
            guild: blizzProfile.guild?.name ?? null,
            profilePicUrl,
            blizzardId: blizzProfile.id,
            lastFetchedAt: new Date(),
          })
          .where(eq(characters.id, characterId));
      }
      await updateStep(characterId, "Blizzard profile", "completed");

      // ── Step 2: Blizzard Achievements ──────────────────────────────
      await updateStep(characterId, "Fetching achievements");
      const achievements = await fetchCharacterAchievements(realmSlug, characterName, region);

      for (const achievement of achievements) {
        const type = getAchievementType(achievement.achievement.name);
        if (!type) continue;

        await db
          .insert(blizzardAchievements)
          .values({
            characterId,
            achievementId: achievement.achievement.id,
            achievementName: achievement.achievement.name,
            completedTimestamp: new Date(achievement.completed_timestamp),
            type,
          })
          .onConflictDoNothing();
      }
      await updateStep(characterId, "Achievements", "completed");

      // ── Step 3: WCL Rankings (Batched per Zone) ────────────────────
      await updateStep(characterId, "Fetching WarcraftLogs rankings");

      const zoneEncounters = await getTrackedEncountersByZone();
      let totalParsesStored = 0;

      // Clear old parses for this character before re-fetching (avoids duplicates on re-queue)
      await db.delete(wclParses).where(eq(wclParses.characterId, characterId));

      for (const zone of zoneEncounters) {
        if (!rateLimitManager.canMakeRequest("wcl")) {
          log.warn("WCL rate limit approaching, waiting 5s");
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        await updateStep(characterId, `Fetching WCL: ${zone.zoneName}`);

        // One batched query per zone (all bosses in one request)
        const rankingsMap = await fetchBatchedEncounterRankings(
          characterName,
          realmSlug,
          region,
          zone.encounterIds,
          5, // Mythic only
        );

        // Store all kills from all encounters in this zone
        for (const [encounterId, rankings] of rankingsMap) {
          if (!rankings?.ranks) continue;

          for (const rank of rankings.ranks) {
            await db.insert(wclParses).values({
              characterId,
              encounterId,
              difficulty: 5,
              reportCode: rank.reportCode,
              wclFightId: rank.fightID,
              percentile: rank.rankPercent,
              dps: rank.amount,
              spec: rank.spec,
              ilvl: rank.bracketData,
              duration: rank.duration,
              killOrWipe: true,
              startTime: new Date(rank.startTime),
              rawData: { ...rank, zoneId: zone.zoneId, totalKills: rankings.totalKills, medianPercent: rankings.medianPercent } as any,
            });
            totalParsesStored++;
          }
        }

        log.debug({ zone: zone.zoneName, encounters: rankingsMap.size, characterName }, "Zone rankings fetched");
      }

      log.info({ characterName, totalParsesStored, zones: zoneEncounters.length }, "WCL rankings complete");
      await updateStep(characterId, "WCL Rankings", "completed");

      // ── Step 4: Raider.IO (Current + Historical) ──────────────────
      await updateStep(characterId, "Fetching Raider.IO data");

      // Clear old runs/scores to avoid duplicates on re-queue
      await db.delete(raiderioRuns).where(eq(raiderioRuns.characterId, characterId));
      await db.delete(raiderioScores).where(eq(raiderioScores.characterId, characterId));

      const rioData = await fetchRaiderioCharacter(characterName, realmSlug, region);
      const currentRioSeasonSlug = rioData?.mythicPlusScores?.[0]?.season ?? null;

      if (rioData) {
        // Store current season M+ score
        for (const score of rioData.mythicPlusScores) {
          await db
            .insert(raiderioScores)
            .values({
              characterId,
              seasonSlug: score.season,
              overallScore: score.scores.all,
              tankScore: score.scores.tank,
              healerScore: score.scores.healer,
              dpsScore: score.scores.dps,
              rawData: score as any,
            })
            .onConflictDoNothing();
        }

        // Store current season best + alternate + recent runs
        const allCurrentRuns = [...rioData.mythicPlusBestRuns, ...rioData.mythicPlusAlternateRuns, ...rioData.mythicPlusRecentRuns];

        // Deduplicate runs by dungeon+keyLevel+completedAt
        const seenRunKeys = new Set<string>();
        for (const run of allCurrentRuns) {
          const runKey = `${run.dungeon}:${run.mythic_level}:${run.completed_at}`;
          if (seenRunKeys.has(runKey)) continue;
          seenRunKeys.add(runKey);

          await db.insert(raiderioRuns).values({
            characterId,
            seasonSlug: currentRioSeasonSlug ?? "current",
            dungeonName: run.dungeon,
            dungeonSlug: run.short_name,
            keyLevel: run.mythic_level,
            score: run.score,
            timed: run.num_keystone_upgrades > 0,
            completedAt: new Date(run.completed_at),
            numKeystoneUpgrades: run.num_keystone_upgrades,
            duration: run.clear_time_ms,
            rawData: run as any,
          });
        }
      }

      // Fetch historical season scores + best runs
      await updateStep(characterId, "Fetching historical M+ data");

      const allRioSeasonSlugs = getAllRioSeasonSlugs();
      // Filter out current season (already fetched)
      const historicalSlugs = allRioSeasonSlugs.filter((s) => s !== currentRioSeasonSlug);

      if (historicalSlugs.length > 0) {
        // Fetch all historical scores in one request
        const historicalScores = await fetchRaiderioHistoricalScores(characterName, realmSlug, region, historicalSlugs);

        for (const score of historicalScores) {
          await db
            .insert(raiderioScores)
            .values({
              characterId,
              seasonSlug: score.season,
              overallScore: score.scores.all,
              tankScore: score.scores.tank,
              healerScore: score.scores.healer,
              dpsScore: score.scores.dps,
              rawData: score as any,
            })
            .onConflictDoNothing();
        }

        // Fetch best runs for historical seasons that had a score
        const scoredHistoricalSlugs = historicalScores.filter((s) => s.scores.all > 0).map((s) => s.season);

        for (const seasonSlug of scoredHistoricalSlugs) {
          try {
            const { bestRuns, alternateRuns } = await fetchRaiderioSeasonBestRuns(characterName, realmSlug, region, seasonSlug);

            const allHistRuns = [...bestRuns, ...alternateRuns];
            const seenKeys = new Set<string>();

            for (const run of allHistRuns) {
              const key = `${run.dungeon}:${run.mythic_level}:${run.completed_at}`;
              if (seenKeys.has(key)) continue;
              seenKeys.add(key);

              await db.insert(raiderioRuns).values({
                characterId,
                seasonSlug,
                dungeonName: run.dungeon,
                dungeonSlug: run.short_name,
                keyLevel: run.mythic_level,
                score: run.score,
                timed: run.num_keystone_upgrades > 0,
                completedAt: new Date(run.completed_at),
                numKeystoneUpgrades: run.num_keystone_upgrades,
                duration: run.clear_time_ms,
                rawData: run as any,
              });
            }
          } catch (err) {
            log.warn({ err, seasonSlug, characterName }, "Failed to fetch historical season runs — continuing");
          }
        }
      }

      await updateStep(characterId, "Raider.IO", "completed");

      // ── Step 5: Compute Profiles ───────────────────────────────────
      await updateStep(characterId, "Computing profile statistics");
      await computeCharacterProfile(characterId);
      await computeBossStats(characterId);
      await updateStep(characterId, "Profile computation", "completed");

      // ── Step 6: AI Summary ─────────────────────────────────────────
      await updateStep(characterId, "Generating AI summary");
      await generateAiSummary(characterId);
      await updateStep(characterId, "AI Summary", "completed");

      // ── Mark Complete ──────────────────────────────────────────────
      await db
        .update(processingState)
        .set({
          lightweightStatus: "completed",
          currentStep: "Complete",
          lightweightCompletedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(processingState.characterId, characterId));
      broadcastQueueStateChange();

      await db.update(characterQueue).set({ status: "completed" }).where(eq(characterQueue.characterId, characterId));
      broadcastQueueStateChange();

      log.info({ characterName, realmSlug }, "Lightweight scan completed");

      // Queue deep scan
      await deepScanQueue.add("deep-scan", {
        characterId,
        characterName,
        realmSlug,
        region,
      });
    } catch (error) {
      log.error({ err: error, characterName, realmSlug }, "Lightweight scan failed");

      await db
        .update(processingState)
        .set({
          lightweightStatus: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          currentStep: "Failed",
        })
        .where(eq(processingState.characterId, characterId));
      broadcastQueueStateChange();

      await db
        .update(characterQueue)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(characterQueue.characterId, characterId));
      broadcastQueueStateChange();

      throw error;
    }
  },
  {
    concurrency: 1,
    embedded: true,
    lockDuration: 5 * 60_000, // 5 minutes — lightweight scan includes AI generation (~20-40s)
  },
);

// ─── Deep Scan Worker ──────────────────────────────────────────────────
const deepScanWorker = new Worker(
  "deep-scan",
  async (job: Job) => {
    const { characterId, characterName, realmSlug, region } = job.data as {
      characterId: string;
      characterName: string;
      realmSlug: string;
      region: string;
    };

    log.info({ characterId, characterName, realmSlug }, "Deep scan started");

    // ── Idempotency guard: skip if already completed ──────────
    const [existingState] = await db.select({ deepScanStatus: processingState.deepScanStatus }).from(processingState).where(eq(processingState.characterId, characterId)).limit(1);

    if (existingState?.deepScanStatus === "completed") {
      log.info({ characterId, characterName }, "Deep scan already completed — skipping duplicate job");
      return;
    }

    try {
      await db
        .update(processingState)
        .set({
          deepScanStatus: "in_progress",
          currentStep: "Deep scan: starting",
          errorMessage: null,
        })
        .where(eq(processingState.characterId, characterId));
      broadcastQueueStateChange();

      // Deep scan fetches detailed fight events (deaths, casts)
      // For now, mark as completed - this will be expanded
      // when we implement full report/fight detail fetching

      await db
        .update(processingState)
        .set({
          deepScanStatus: "completed",
          currentStep: "Complete",
          deepScanCompletedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(processingState.characterId, characterId));
      broadcastQueueStateChange();

      // Recompute with deeper data
      await computeCharacterProfile(characterId);
      await computeBossStats(characterId);

      // Regenerate AI summary with richer data
      await generateAiSummary(characterId);

      log.info({ characterName, realmSlug }, "Deep scan completed");
    } catch (error) {
      log.error({ err: error, characterName, realmSlug }, "Deep scan failed");

      await db
        .update(processingState)
        .set({
          deepScanStatus: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(processingState.characterId, characterId));
      broadcastQueueStateChange();

      throw error;
    }
  },
  {
    concurrency: 1,
    embedded: true,
    lockDuration: 3 * 60_000, // 3 minutes — deep scan includes AI regeneration
  },
);

// ─── Rate Limit Integration ───────────────────────────────────────────
rateLimitManager.registerPauseResume(
  "wcl",
  () => {
    log.info("Pausing lightweight worker due to WCL rate limit");
    lightweightWorker.pause();
  },
  () => {
    log.info("Resuming lightweight worker");
    lightweightWorker.resume();
  },
);

// ─── Public API ────────────────────────────────────────────────────────
export async function addToLightweightQueue(characterId: string, name: string, realmSlug: string, region: string) {
  await lightweightQueue.add("lightweight-scan", {
    characterId,
    characterName: name,
    realmSlug,
    region,
  });
  log.info({ characterName: name, realmSlug }, "Added to lightweight queue");
}

export async function addToDeepScanQueue(characterId: string, name: string, realmSlug: string, region: string) {
  await deepScanQueue.add("deep-scan", {
    characterId,
    characterName: name,
    realmSlug,
    region,
  });
  log.info({ characterName: name, realmSlug }, "Added to deep-scan queue");
}

export function getQueues() {
  return { lightweightQueue, deepScanQueue };
}

export function getWorkers() {
  return { lightweightWorker, deepScanWorker };
}

log.info("BunQueue workers initialized");
