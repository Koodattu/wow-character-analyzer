// ─── Character Routes ──────────────────────────────────────────────────
import { Elysia, t } from "elysia";
import { eq, and, like, or, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  characters,
  characterProfiles,
  characterBossStats,
  characterAiSummary,
  characterQueue,
  processingState,
  wclParses,
  raiderioScores,
  raiderioRuns,
  blizzardAchievements,
} from "../db/schema";
import { authPlugin, requireAuth } from "../auth/middleware";
import { createId } from "@paralleldrive/cuid2";
import { log } from "../lib/logger";

export const characterRoutes = new Elysia({ prefix: "/api/characters" })
  .use(authPlugin)

  // ── List / Search Characters ────────────────────────────────────────
  .get(
    "/",
    async ({ query }) => {
      const { search, className, faction, status, page, limit } = query;
      const pageNum = parseInt(page ?? "1", 10);
      const pageSize = Math.min(parseInt(limit ?? "20", 10), 100);
      const offset = (pageNum - 1) * pageSize;

      const conditions = [];

      if (search) {
        const pattern = `%${search}%`;
        conditions.push(or(like(characters.name, pattern), like(characters.realm, pattern), like(characters.guild, pattern)));
      }

      if (className) {
        conditions.push(eq(characters.className, className));
      }

      if (faction) {
        conditions.push(eq(characters.faction, faction));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [results, countResult] = await Promise.all([
        db
          .select({
            id: characters.id,
            name: characters.name,
            realm: characters.realm,
            realmSlug: characters.realmSlug,
            region: characters.region,
            className: characters.className,
            specName: characters.specName,
            race: characters.race,
            faction: characters.faction,
            guild: characters.guild,
            profilePicUrl: characters.profilePicUrl,
            bestParse: characterProfiles.bestParse,
            avgParse: characterProfiles.avgParse,
            currentMplusScore: characterProfiles.currentMplusScore,
          })
          .from(characters)
          .leftJoin(characterProfiles, eq(characters.id, characterProfiles.characterId))
          .where(whereClause)
          .orderBy(desc(characters.updatedAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(characters)
          .where(whereClause),
      ]);

      return {
        characters: results,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total: Number(countResult[0]?.count ?? 0),
          totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / pageSize),
        },
      };
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        className: t.Optional(t.String()),
        faction: t.Optional(t.String()),
        status: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  )

  // ── Featured Characters (frontpage) ─────────────────────────────────
  .get("/featured", async () => {
    const results = await db
      .select({
        id: characters.id,
        name: characters.name,
        realm: characters.realm,
        realmSlug: characters.realmSlug,
        region: characters.region,
        className: characters.className,
        specName: characters.specName,
        faction: characters.faction,
        guild: characters.guild,
        profilePicUrl: characters.profilePicUrl,
        bestParse: characterProfiles.bestParse,
        avgParse: characterProfiles.avgParse,
        currentMplusScore: characterProfiles.currentMplusScore,
      })
      .from(characters)
      .leftJoin(characterProfiles, eq(characters.id, characterProfiles.characterId))
      .orderBy(sql`RANDOM()`)
      .limit(12);

    return { characters: results };
  })

  // ── Currently Processing ────────────────────────────────────────────
  .get("/processing", async () => {
    const results = await db
      .select({
        id: characters.id,
        name: characters.name,
        realm: characters.realm,
        realmSlug: characters.realmSlug,
        className: characters.className,
        specName: characters.specName,
        faction: characters.faction,
        profilePicUrl: characters.profilePicUrl,
        currentStep: processingState.currentStep,
        lightweightStatus: processingState.lightweightStatus,
        deepScanStatus: processingState.deepScanStatus,
        stepsCompleted: processingState.stepsCompleted,
        totalSteps: processingState.totalSteps,
      })
      .from(characters)
      .innerJoin(processingState, eq(characters.id, processingState.characterId))
      .where(or(eq(processingState.lightweightStatus, "in_progress"), eq(processingState.deepScanStatus, "in_progress")));

    return { characters: results };
  })

  // ── Single Character Profile ────────────────────────────────────────
  .get(
    "/:realm/:name",
    async ({ params }) => {
      const realmSlug = params.realm.toLowerCase();
      const charName = params.name.toLowerCase();

      // Find the character
      const [char] = await db
        .select()
        .from(characters)
        .where(and(eq(characters.realmSlug, realmSlug), sql`LOWER(${characters.name}) = ${charName}`))
        .limit(1);

      if (!char) {
        return { error: "Character not found", character: null };
      }

      // Fetch all related data in parallel
      const [profile, bossStatsData, aiSummaryData, processingData, parsesData, scoresData, runsData, achievementsData] = await Promise.all([
        db.select().from(characterProfiles).where(eq(characterProfiles.characterId, char.id)).limit(1),
        db.select().from(characterBossStats).where(eq(characterBossStats.characterId, char.id)),
        db.select().from(characterAiSummary).where(eq(characterAiSummary.characterId, char.id)).limit(1),
        db.select().from(processingState).where(eq(processingState.characterId, char.id)).limit(1),
        db.select().from(wclParses).where(eq(wclParses.characterId, char.id)).orderBy(desc(wclParses.startTime)),
        db.select().from(raiderioScores).where(eq(raiderioScores.characterId, char.id)),
        db.select().from(raiderioRuns).where(eq(raiderioRuns.characterId, char.id)).orderBy(desc(raiderioRuns.completedAt)),
        db.select().from(blizzardAchievements).where(eq(blizzardAchievements.characterId, char.id)),
      ]);

      return {
        character: char,
        profile: profile[0] ?? null,
        bossStats: bossStatsData,
        aiSummary: aiSummaryData[0] ?? null,
        processing: processingData[0] ?? null,
        parses: parsesData,
        mythicPlusScores: scoresData,
        mythicPlusRuns: runsData,
        achievements: achievementsData,
      };
    },
    {
      params: t.Object({
        realm: t.String(),
        name: t.String(),
      }),
    },
  )

  // ── Queue Character for Processing ──────────────────────────────────
  .post(
    "/queue",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Authentication required" };
      }

      const { name, realm, region } = body;
      const realmSlug = realm.toLowerCase().replace(/\s+/g, "-");
      const charName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

      // Check if character already exists
      let [existing] = await db
        .select()
        .from(characters)
        .where(and(eq(characters.realmSlug, realmSlug), sql`LOWER(${characters.name}) = ${charName.toLowerCase()}`))
        .limit(1);

      // Check if already queued recently (within 24h)
      if (existing) {
        const [recentQueue] = await db
          .select()
          .from(characterQueue)
          .where(and(eq(characterQueue.characterId, existing.id), sql`${characterQueue.createdAt} > NOW() - INTERVAL '24 hours'`))
          .limit(1);

        if (recentQueue) {
          return {
            message: "Character already queued recently",
            characterId: existing.id,
          };
        }
      }

      // Create character if it doesn't exist
      if (!existing) {
        const charId = createId();
        [existing] = await db
          .insert(characters)
          .values({
            id: charId,
            name: charName,
            realm: realm,
            realmSlug,
            region: region ?? "eu",
          })
          .returning();
      }

      // Create queue entry
      await db.insert(characterQueue).values({
        characterId: existing.id,
        queuedById: user.id,
        status: "pending",
      });

      // Create/update processing state
      const [existingState] = await db.select().from(processingState).where(eq(processingState.characterId, existing.id)).limit(1);

      if (!existingState) {
        await db.insert(processingState).values({
          characterId: existing.id,
          lightweightStatus: "pending",
          deepScanStatus: "pending",
          currentStep: "Queued",
          stepsCompleted: [],
          totalSteps: 6,
        });
      } else {
        await db
          .update(processingState)
          .set({
            lightweightStatus: "pending",
            currentStep: "Queued",
            stepsCompleted: [],
          })
          .where(eq(processingState.characterId, existing.id));
      }

      // Add to BunQueue (imported dynamically to avoid circular deps)
      try {
        const { addToLightweightQueue } = await import("../queue");
        await addToLightweightQueue(existing.id, existing.name, existing.realmSlug, existing.region);
      } catch (error) {
        log.error({ err: error }, "Failed to add character to queue");
      }

      return {
        message: "Character queued for processing",
        characterId: existing.id,
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 12 }),
        realm: t.String({ minLength: 2 }),
        region: t.Optional(t.String()),
      }),
    },
  )

  // ── Queue Multiple Characters (batch) ───────────────────────────────
  .post(
    "/queue/batch",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Authentication required" };
      }

      if (body.characters.length > 3) {
        set.status = 400;
        return { error: "Maximum 3 characters per batch" };
      }

      const results = [];
      for (const char of body.characters) {
        const realmSlug = char.realm.toLowerCase().replace(/\s+/g, "-");
        const charName = char.name.charAt(0).toUpperCase() + char.name.slice(1).toLowerCase();

        let [existing] = await db
          .select()
          .from(characters)
          .where(and(eq(characters.realmSlug, realmSlug), sql`LOWER(${characters.name}) = ${charName.toLowerCase()}`))
          .limit(1);

        if (!existing) {
          const charId = createId();
          [existing] = await db
            .insert(characters)
            .values({
              id: charId,
              name: charName,
              realm: char.realm,
              realmSlug,
              region: char.region ?? "eu",
            })
            .returning();
        }

        await db.insert(characterQueue).values({
          characterId: existing.id,
          queuedById: user.id,
          status: "pending",
        });

        const [existingState] = await db.select().from(processingState).where(eq(processingState.characterId, existing.id)).limit(1);

        if (!existingState) {
          await db.insert(processingState).values({
            characterId: existing.id,
            lightweightStatus: "pending",
            deepScanStatus: "pending",
            currentStep: "Queued",
            stepsCompleted: [],
            totalSteps: 6,
          });
        }

        try {
          const { addToLightweightQueue } = await import("../queue");
          await addToLightweightQueue(existing.id, existing.name, existing.realmSlug, existing.region);
        } catch (error) {
          log.error({ err: error }, "Failed to add character to queue");
        }

        results.push({ characterId: existing.id, name: charName });
      }

      return { message: "Characters queued", characters: results };
    },
    {
      body: t.Object({
        characters: t.Array(
          t.Object({
            name: t.String({ minLength: 2, maxLength: 12 }),
            realm: t.String({ minLength: 2 }),
            region: t.Optional(t.String()),
          }),
          { maxItems: 3 },
        ),
      }),
    },
  );
