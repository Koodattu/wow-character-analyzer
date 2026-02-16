// ─── Admin Routes ──────────────────────────────────────────────────────
import { Elysia, t } from "elysia";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../db";
import { characters, characterQueue, processingState, characterProfiles, characterBossStats, characterAiSummary, expansions, seasons, raids, bosses, dungeons } from "../db/schema";
import { requireAdmin } from "../auth/middleware";
import { rateLimitManager } from "../services/rate-limiter";
import { log } from "../lib/logger";

export const adminRoutes = new Elysia({ prefix: "/api/admin" })
  .use(requireAdmin)

  // ── Character List ─────────────────────────────────────────────────
  .get("/characters", async () => {
    const rows = await db
      .select({
        id: characters.id,
        name: characters.name,
        realm: characters.realm,
        realmSlug: characters.realmSlug,
        region: characters.region,
        className: characters.className,
        specName: characters.specName,
        lastFetchedAt: characters.lastFetchedAt,
        updatedAt: characters.updatedAt,
        lightweightStatus: processingState.lightweightStatus,
        deepScanStatus: processingState.deepScanStatus,
        currentStep: processingState.currentStep,
      })
      .from(characters)
      .leftJoin(processingState, eq(processingState.characterId, characters.id))
      .orderBy(desc(characters.updatedAt))
      .limit(100);

    return { characters: rows };
  })

  // ── Queue Overview ──────────────────────────────────────────────────
  .get("/queue", async () => {
    const [pendingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(characterQueue)
      .where(eq(characterQueue.status, "pending"));

    const [processingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(characterQueue)
      .where(eq(characterQueue.status, "processing"));

    const [completedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(characterQueue)
      .where(eq(characterQueue.status, "completed"));

    const [failedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(characterQueue)
      .where(eq(characterQueue.status, "failed"));

    // Currently processing characters
    const currentlyProcessing = await db
      .select({
        id: characters.id,
        name: characters.name,
        realm: characters.realm,
        currentStep: processingState.currentStep,
        lightweightStatus: processingState.lightweightStatus,
        deepScanStatus: processingState.deepScanStatus,
        stepsCompleted: processingState.stepsCompleted,
        totalSteps: processingState.totalSteps,
      })
      .from(processingState)
      .innerJoin(characters, eq(processingState.characterId, characters.id))
      .where(eq(processingState.lightweightStatus, "in_progress"))
      .limit(5);

    // Recent queue entries
    const recentQueue = await db
      .select({
        id: characterQueue.id,
        characterName: characters.name,
        characterRealm: characters.realm,
        status: characterQueue.status,
        createdAt: characterQueue.createdAt,
      })
      .from(characterQueue)
      .innerJoin(characters, eq(characterQueue.characterId, characters.id))
      .orderBy(desc(characterQueue.createdAt))
      .limit(20);

    return {
      counts: {
        pending: Number(pendingCount?.count ?? 0),
        processing: Number(processingCount?.count ?? 0),
        completed: Number(completedCount?.count ?? 0),
        failed: Number(failedCount?.count ?? 0),
      },
      currentlyProcessing,
      recentQueue,
    };
  })

  // ── Rate Limit Status ───────────────────────────────────────────────
  .get("/rate-limits", () => {
    return { rateLimits: rateLimitManager.getAllStatus() };
  })

  // ── Trigger Reprocessing ────────────────────────────────────────────
  .post(
    "/reprocess",
    async ({ body }) => {
      const { characterId, all } = body;

      if (all) {
        // Drop all processed data and re-queue everything
        await db.delete(characterProfiles);
        await db.delete(characterBossStats);
        await db.delete(characterAiSummary);

        // Re-queue all characters
        const allChars = await db.select().from(characters);
        for (const char of allChars) {
          await db
            .update(processingState)
            .set({
              lightweightStatus: "pending",
              deepScanStatus: "pending",
              currentStep: "Queued for reprocessing",
              stepsCompleted: [],
            })
            .where(eq(processingState.characterId, char.id));

          try {
            const { addToLightweightQueue } = await import("../queue");
            await addToLightweightQueue(char.id, char.name, char.realmSlug, char.region);
          } catch (error) {
            log.error({ err: error, characterId: char.id }, "Failed to requeue character");
          }
        }

        return { message: `Reprocessing triggered for ${allChars.length} characters` };
      }

      if (characterId) {
        // Drop processed data for specific character
        await db.delete(characterProfiles).where(eq(characterProfiles.characterId, characterId));
        await db.delete(characterBossStats).where(eq(characterBossStats.characterId, characterId));
        await db.delete(characterAiSummary).where(eq(characterAiSummary.characterId, characterId));

        const [char] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);

        if (char) {
          await db
            .update(processingState)
            .set({
              lightweightStatus: "pending",
              deepScanStatus: "pending",
              currentStep: "Queued for reprocessing",
              stepsCompleted: [],
            })
            .where(eq(processingState.characterId, characterId));

          try {
            const { addToLightweightQueue } = await import("../queue");
            await addToLightweightQueue(char.id, char.name, char.realmSlug, char.region);
          } catch (error) {
            log.error({ err: error, characterId }, "Failed to requeue character");
          }
        }

        return { message: `Reprocessing triggered for character ${characterId}` };
      }

      return { error: "Provide characterId or set all: true" };
    },
    {
      body: t.Object({
        characterId: t.Optional(t.String()),
        all: t.Optional(t.Boolean()),
      }),
    },
  )

  // ── Season Config ───────────────────────────────────────────────────
  .get("/config/seasons", async () => {
    const expansionData = await db.select().from(expansions);
    const seasonData = await db.select().from(seasons);
    const raidData = await db.select().from(raids);
    const bossData = await db.select().from(bosses);
    const dungeonData = await db.select().from(dungeons);

    return {
      expansions: expansionData,
      seasons: seasonData,
      raids: raidData,
      bosses: bossData,
      dungeons: dungeonData,
    };
  })

  // ── Add/Update Season Config ────────────────────────────────────────
  .post(
    "/config/seasons",
    async ({ body }) => {
      const { expansion, season, raidList, bossList, dungeonList } = body;

      // Upsert expansion
      let expansionId: string;
      const [existingExpansion] = await db.select().from(expansions).where(eq(expansions.slug, expansion.slug)).limit(1);

      if (existingExpansion) {
        expansionId = existingExpansion.id;
        await db.update(expansions).set({ name: expansion.name, logoUrl: expansion.logoUrl }).where(eq(expansions.id, expansionId));
      } else {
        const [newExpansion] = await db
          .insert(expansions)
          .values({
            name: expansion.name,
            slug: expansion.slug,
            logoUrl: expansion.logoUrl,
            sortOrder: expansion.sortOrder ?? 0,
          })
          .returning();
        expansionId = newExpansion.id;
      }

      // Upsert season
      let seasonId: string;
      const [existingSeason] = await db.select().from(seasons).where(eq(seasons.slug, season.slug)).limit(1);

      if (existingSeason) {
        seasonId = existingSeason.id;
        await db.update(seasons).set({ name: season.name, number: season.number }).where(eq(seasons.id, seasonId));
      } else {
        const [newSeason] = await db
          .insert(seasons)
          .values({
            expansionId,
            name: season.name,
            slug: season.slug,
            number: season.number,
          })
          .returning();
        seasonId = newSeason.id;
      }

      return { expansionId, seasonId };
    },
    {
      body: t.Object({
        expansion: t.Object({
          name: t.String(),
          slug: t.String(),
          logoUrl: t.Optional(t.String()),
          sortOrder: t.Optional(t.Number()),
        }),
        season: t.Object({
          name: t.String(),
          slug: t.String(),
          number: t.Number(),
        }),
        raidList: t.Optional(t.Array(t.Any())),
        bossList: t.Optional(t.Array(t.Any())),
        dungeonList: t.Optional(t.Array(t.Any())),
      }),
    },
  );
