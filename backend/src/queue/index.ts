// ─── BunQueue Setup ────────────────────────────────────────────────────
// Embedded job queue with SQLite persistence — no Redis required
import { Queue, Worker } from "bunqueue/client";
import type { Job } from "bunqueue/client";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { characters, processingState, characterQueue, wclParses, raiderioScores, raiderioRuns, blizzardAchievements } from "../db/schema";
import { fetchCharacterProfile, fetchCharacterMedia, fetchCharacterAchievements, getAchievementType } from "../services/blizzard";
import { fetchEncounterRankings, type WclEncounterRanking } from "../services/warcraftlogs";
import { fetchRaiderioCharacter, fetchRaiderioHistoricalScores } from "../services/raiderio";
import { computeCharacterProfile, computeBossStats } from "../processing/profile";
import { generateAiSummary } from "../processing/ai-summary";
import { rateLimitManager } from "../services/rate-limiter";

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
}

// ─── Tracked Boss Encounter IDs ────────────────────────────────────────
// These are WCL encounter IDs for bosses we track
// TWW Season 2 - Liberation of Undermine
const TRACKED_ENCOUNTERS = [
  // Liberation of Undermine (TWW S2)
  3009, // Vexie and the Geargrinders
  3010, // Cauldron of Carnage
  3011, // Rik Reverb
  3012, // Stix Bunkjunker
  3013, // The Sprocketmonger
  3014, // Crowd Pummeler 9-60
  3015, // Mug'Zee, Heads of Security
  3016, // Gallagio
  // Nerub-ar Palace (TWW S1)
  2902, // Ulgrax the Devourer
  2917, // The Bloodbound Horror
  2898, // Sikran
  2918, // Rasha'nan
  2919, // Broodtwister Ovi'nax
  2920, // Nexus-Princess Ky'veza
  2921, // The Silken Court
  2922, // Queen Ansurek
];

// ─── Lightweight Scan Worker ───────────────────────────────────────────
const lightweightWorker = new Worker(
  "lightweight-scan",
  async (job: Job) => {
    const { characterId, name, realmSlug, region } = job.data as {
      characterId: string;
      name: string;
      realmSlug: string;
      region: string;
    };

    console.log(`[Lightweight] Processing: ${name}-${realmSlug} (${characterId})`);

    try {
      // Update status
      await db.update(processingState).set({ lightweightStatus: "in_progress", currentStep: "Starting..." }).where(eq(processingState.characterId, characterId));

      await db.update(characterQueue).set({ status: "processing" }).where(eq(characterQueue.characterId, characterId));

      // ── Step 1: Blizzard Profile ───────────────────────────────────
      await updateStep(characterId, "Fetching Blizzard profile");
      const blizzProfile = await fetchCharacterProfile(realmSlug, name, region);
      const blizzMedia = await fetchCharacterMedia(realmSlug, name, region);

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
      const achievements = await fetchCharacterAchievements(realmSlug, name, region);

      for (const achievement of achievements) {
        const type = getAchievementType(achievement.achievement.id);
        if (!type) continue;

        // Upsert achievement
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

      // ── Step 3: WCL Rankings ───────────────────────────────────────
      await updateStep(characterId, "Fetching WarcraftLogs rankings");

      for (const encounterId of TRACKED_ENCOUNTERS) {
        if (!rateLimitManager.canMakeRequest("wcl")) {
          console.log("[Lightweight] WCL rate limit reached, waiting...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        const rankings = await fetchEncounterRankings(
          name,
          realmSlug,
          region,
          encounterId,
          5, // Mythic
        );

        if (rankings?.ranks) {
          for (const rank of rankings.ranks) {
            // Check for duplicate
            const existing = await db.select().from(wclParses).where(eq(wclParses.characterId, characterId)).limit(1);

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
              rawData: rank as any,
            });
          }
        }
      }
      await updateStep(characterId, "WCL Rankings", "completed");

      // ── Step 4: Raider.IO ──────────────────────────────────────────
      await updateStep(characterId, "Fetching Raider.IO data");

      const rioData = await fetchRaiderioCharacter(name, realmSlug, region);

      if (rioData) {
        // Store M+ scores
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

        // Store M+ runs
        const allRuns = [...rioData.mythicPlusBestRuns, ...rioData.mythicPlusRecentRuns, ...rioData.mythicPlusAlternateRuns];

        for (const run of allRuns) {
          await db.insert(raiderioRuns).values({
            characterId,
            seasonSlug: "current",
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
        })
        .where(eq(processingState.characterId, characterId));

      await db.update(characterQueue).set({ status: "completed" }).where(eq(characterQueue.characterId, characterId));

      console.log(`[Lightweight] Completed: ${name}-${realmSlug}`);

      // Queue deep scan
      await deepScanQueue.add("deep-scan", {
        characterId,
        name,
        realmSlug,
        region,
      });
    } catch (error) {
      console.error(`[Lightweight] Error processing ${name}-${realmSlug}:`, error);

      await db
        .update(processingState)
        .set({
          lightweightStatus: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          currentStep: "Failed",
        })
        .where(eq(processingState.characterId, characterId));

      await db
        .update(characterQueue)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(characterQueue.characterId, characterId));

      throw error;
    }
  },
  {
    concurrency: 1,
    embedded: true,
  },
);

// ─── Deep Scan Worker ──────────────────────────────────────────────────
const deepScanWorker = new Worker(
  "deep-scan",
  async (job: Job) => {
    const { characterId, name, realmSlug, region } = job.data as {
      characterId: string;
      name: string;
      realmSlug: string;
      region: string;
    };

    console.log(`[DeepScan] Processing: ${name}-${realmSlug} (${characterId})`);

    try {
      await db
        .update(processingState)
        .set({
          deepScanStatus: "in_progress",
          currentStep: "Deep scan: starting",
        })
        .where(eq(processingState.characterId, characterId));

      // Deep scan fetches detailed fight events (deaths, casts)
      // For now, mark as completed - this will be expanded
      // when we implement full report/fight detail fetching

      await db
        .update(processingState)
        .set({
          deepScanStatus: "completed",
          currentStep: "Complete",
          deepScanCompletedAt: new Date(),
        })
        .where(eq(processingState.characterId, characterId));

      // Recompute with deeper data
      await computeCharacterProfile(characterId);
      await computeBossStats(characterId);

      // Regenerate AI summary with richer data
      await generateAiSummary(characterId);

      console.log(`[DeepScan] Completed: ${name}-${realmSlug}`);
    } catch (error) {
      console.error(`[DeepScan] Error processing ${name}-${realmSlug}:`, error);

      await db
        .update(processingState)
        .set({
          deepScanStatus: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(processingState.characterId, characterId));

      throw error;
    }
  },
  {
    concurrency: 1,
    embedded: true,
  },
);

// ─── Rate Limit Integration ───────────────────────────────────────────
rateLimitManager.registerPauseResume(
  "wcl",
  () => {
    console.log("[Queue] Pausing lightweight worker due to WCL rate limit");
    lightweightWorker.pause();
  },
  () => {
    console.log("[Queue] Resuming lightweight worker");
    lightweightWorker.resume();
  },
);

// ─── Public API ────────────────────────────────────────────────────────
export async function addToLightweightQueue(characterId: string, name: string, realmSlug: string, region: string) {
  await lightweightQueue.add("lightweight-scan", {
    characterId,
    name,
    realmSlug,
    region,
  });
  console.log(`[Queue] Added ${name}-${realmSlug} to lightweight queue`);
}

export async function addToDeepScanQueue(characterId: string, name: string, realmSlug: string, region: string) {
  await deepScanQueue.add("deep-scan", {
    characterId,
    name,
    realmSlug,
    region,
  });
  console.log(`[Queue] Added ${name}-${realmSlug} to deep-scan queue`);
}

export function getQueues() {
  return { lightweightQueue, deepScanQueue };
}

export function getWorkers() {
  return { lightweightWorker, deepScanWorker };
}

console.log("[Queue] BunQueue workers initialized");
