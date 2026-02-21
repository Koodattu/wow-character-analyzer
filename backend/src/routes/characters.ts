// ─── Character Routes ──────────────────────────────────────────────────
import { Elysia, t } from "elysia";
import { eq, and, ilike, or, desc, sql, inArray, ne, asc } from "drizzle-orm";
import { db } from "../db";
import {
  characters,
  characterProfiles,
  characterAiSummary,
  characterQueue,
  processingState,
  wclParses,
  raiderioScores,
  raiderioRuns,
  blizzardAchievements,
  expansions,
  seasons,
  raids,
  bosses,
} from "../db/schema";
import { authPlugin, requireAuth } from "../auth/middleware";
import { createId } from "@paralleldrive/cuid2";
import { log } from "../lib/logger";
import { createSseResponse, publishProcessingUpdate, publishUserQueuedUpdate, subscribeProcessingUpdates } from "../lib/sse";

async function getProcessingCharacters() {
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

  return results;
}

async function getFeaturedCharacters() {
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
    .innerJoin(processingState, eq(characters.id, processingState.characterId))
    .leftJoin(characterProfiles, eq(characters.id, characterProfiles.characterId))
    .where(
      and(
        ne(processingState.lightweightStatus, "in_progress"),
        ne(processingState.deepScanStatus, "in_progress"),
        or(
          eq(processingState.lightweightStatus, "completed"),
          eq(processingState.deepScanStatus, "completed"),
          and(eq(processingState.lightweightStatus, "pending"), sql`${characterProfiles.characterId} IS NOT NULL`),
        ),
      ),
    )
    .orderBy(desc(processingState.updatedAt))
    .limit(12);

  return results;
}

async function getWaitingCharacters() {
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
      queuedAt: characterQueue.createdAt,
    })
    .from(characters)
    .innerJoin(processingState, eq(characters.id, processingState.characterId))
    .leftJoin(characterQueue, and(eq(characterQueue.characterId, characters.id), eq(characterQueue.status, "pending")))
    .where(eq(processingState.lightweightStatus, "pending"))
    .orderBy(desc(characterQueue.createdAt), desc(processingState.updatedAt))
    .limit(12);

  return results;
}

async function getFrontpagePayload() {
  const [processingCharacters, processedCharacters, waitingCharacters] = await Promise.all([getProcessingCharacters(), getFeaturedCharacters(), getWaitingCharacters()]);

  return {
    processingCharacters,
    processedCharacters,
    waitingCharacters,
  };
}

async function getCharacterProfilePayload(realm: string, name: string) {
  const realmSlug = realm.toLowerCase();
  const charName = name.toLowerCase();

  const [char] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.realmSlug, realmSlug), sql`LOWER(${characters.name}) = ${charName}`))
    .limit(1);

  if (!char) {
    return { error: "Character not found", character: null };
  }

  const [profile, aiSummaryData, processingData, parsesData, scoresData, runsData, achievementsData] = await Promise.all([
    db.select().from(characterProfiles).where(eq(characterProfiles.characterId, char.id)).limit(1),
    db.select().from(characterAiSummary).where(eq(characterAiSummary.characterId, char.id)).limit(1),
    db.select().from(processingState).where(eq(processingState.characterId, char.id)).limit(1),
    db.select().from(wclParses).where(eq(wclParses.characterId, char.id)).orderBy(desc(wclParses.startTime)),
    db.select().from(raiderioScores).where(eq(raiderioScores.characterId, char.id)),
    db.select().from(raiderioRuns).where(eq(raiderioRuns.characterId, char.id)).orderBy(desc(raiderioRuns.completedAt)),
    db.select().from(blizzardAchievements).where(eq(blizzardAchievements.characterId, char.id)),
  ]);

  // ── Build structured raid data ──────────────────────────────────────
  // Fetch config tables: expansions → seasons → raids → bosses
  const allExpansions = await db.select().from(expansions).orderBy(desc(expansions.sortOrder));
  const allSeasons = await db.select().from(seasons);
  const allRaids = await db.select().from(raids).orderBy(asc(raids.sortOrder));
  const allBosses = await db.select().from(bosses).orderBy(asc(bosses.sortOrder));

  // Group parses by encounterId for fast lookup
  const parsesByEncounter = new Map<number, typeof parsesData>();
  for (const parse of parsesData) {
    const eid = parse.encounterId;
    if (!parsesByEncounter.has(eid)) parsesByEncounter.set(eid, []);
    parsesByEncounter.get(eid)!.push(parse);
  }

  // Build the nested structure: expansion → raids → bosses
  const raidData = allExpansions.map((exp) => {
    const expSeasons = allSeasons.filter((s) => s.expansionId === exp.id);
    const expSeasonIds = new Set(expSeasons.map((s) => s.id));
    const expRaids = allRaids.filter((r) => expSeasonIds.has(r.seasonId));

    return {
      id: exp.id,
      name: exp.name,
      slug: exp.slug,
      raids: expRaids.map((raid) => {
        const raidBosses = allBosses.filter((b) => b.raidId === raid.id);

        return {
          id: raid.id,
          name: raid.name,
          slug: raid.slug,
          iconUrl: raid.iconUrl,
          bosses: raidBosses.map((boss) => {
            const encounterParses = boss.wclEncounterId ? (parsesByEncounter.get(boss.wclEncounterId) ?? []) : [];
            const kills = encounterParses.filter((p) => p.killOrWipe === true);
            const parseValues = kills.map((k) => k.percentile).filter((p): p is number => p !== null);
            const sorted = [...parseValues].sort((a, b) => a - b);

            // Compute per-spec breakdown
            const specMap = new Map<string, number[]>();
            for (const kill of kills) {
              if (!kill.spec || kill.percentile === null) continue;
              if (!specMap.has(kill.spec)) specMap.set(kill.spec, []);
              specMap.get(kill.spec)!.push(kill.percentile);
            }

            const specs = [...specMap.entries()].map(([spec, values]) => {
              const specSorted = [...values].sort((a, b) => a - b);
              return {
                spec,
                kills: values.length,
                bestParse: specSorted.length > 0 ? specSorted[specSorted.length - 1] : null,
                medianParse: specSorted.length > 0 ? specSorted[Math.floor(specSorted.length / 2)] : null,
                avgParse: specSorted.length > 0 ? specSorted.reduce((a, b) => a + b, 0) / specSorted.length : null,
              };
            });

            return {
              id: boss.id,
              name: boss.name,
              slug: boss.slug,
              iconUrl: boss.iconUrl,
              encounterId: boss.wclEncounterId,
              totalKills: kills.length,
              bestParse: sorted.length > 0 ? sorted[sorted.length - 1] : null,
              medianParse: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null,
              avgParse: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
              specs,
              recentKills: kills.slice(0, 20).map((k) => ({
                percentile: k.percentile,
                dps: k.dps,
                spec: k.spec,
                ilvl: k.ilvl,
                duration: k.duration,
                startTime: k.startTime,
                reportCode: k.reportCode,
              })),
            };
          }),
        };
      }),
    };
  });

  // ── Build structured M+ data ──────────────────────────────────────
  // Group runs and scores by season slug
  const scoresBySeasonSlug = new Map<string, (typeof scoresData)[0]>();
  for (const score of scoresData) {
    if (score.seasonSlug) scoresBySeasonSlug.set(score.seasonSlug, score);
  }

  const runsBySeasonSlug = new Map<string, typeof runsData>();
  for (const run of runsData) {
    const slug = run.seasonSlug ?? "unknown";
    if (!runsBySeasonSlug.has(slug)) runsBySeasonSlug.set(slug, []);
    runsBySeasonSlug.get(slug)!.push(run);
  }

  // Build M+ season list — use all seasons that have either a score or runs
  const allSeasonSlugs = new Set([...scoresBySeasonSlug.keys(), ...runsBySeasonSlug.keys()]);
  const mythicPlusSeasons = [...allSeasonSlugs]
    .map((seasonSlug) => {
      const score = scoresBySeasonSlug.get(seasonSlug);
      const seasonRuns = runsBySeasonSlug.get(seasonSlug) ?? [];

      // Group runs by dungeon name
      const dungeonMap = new Map<string, typeof seasonRuns>();
      for (const run of seasonRuns) {
        const name = run.dungeonName ?? "Unknown";
        if (!dungeonMap.has(name)) dungeonMap.set(name, []);
        dungeonMap.get(name)!.push(run);
      }

      const dungeonData = [...dungeonMap.entries()].map(([name, runs]) => {
        // Best run = highest score
        const bestRun = runs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
        const timedRuns = runs.filter((r) => r.timed === true).length;
        const depletedRuns = runs.filter((r) => r.timed === false).length;

        return {
          name,
          slug: bestRun?.dungeonSlug ?? null,
          bestRun: bestRun
            ? {
                keyLevel: bestRun.keyLevel,
                score: bestRun.score,
                timed: bestRun.timed,
                upgrades: bestRun.numKeystoneUpgrades,
                duration: bestRun.duration,
                completedAt: bestRun.completedAt,
              }
            : null,
          totalRuns: runs.length,
          timedRuns,
          depletedRuns,
        };
      });

      // Sort dungeons by best key level descending
      dungeonData.sort((a, b) => (b.bestRun?.keyLevel ?? 0) - (a.bestRun?.keyLevel ?? 0));

      return {
        seasonSlug,
        score: score
          ? {
              overall: score.overallScore,
              tank: score.tankScore ?? 0,
              healer: score.healerScore ?? 0,
              dps: score.dpsScore ?? 0,
            }
          : null,
        dungeons: dungeonData,
      };
    })
    // Sort by season slug (newest first — raiderio slugs sort lexically)
    .sort((a, b) => b.seasonSlug.localeCompare(a.seasonSlug));

  return {
    character: char,
    profile: profile[0] ?? null,
    aiSummary: aiSummaryData[0] ?? null,
    processing: processingData[0] ?? null,
    achievements: achievementsData,
    raidData,
    mythicPlusData: { seasons: mythicPlusSeasons },
  };
}

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
        conditions.push(or(ilike(characters.name, pattern), ilike(characters.realm, pattern), ilike(characters.guild, pattern)));
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

  // ── Stream Frontpage Data Updates (SSE) ────────────────────────────
  .get("/frontpage/stream", async ({ request }) => {
    return createSseResponse({
      request,
      subscribe: subscribeProcessingUpdates,
      loadSnapshot: getFrontpagePayload,
      snapshotErrorMessage: "Failed to load frontpage state",
    });
  })

  // ── Single Character Profile ────────────────────────────────────────
  .get(
    "/:realm/:name",
    async ({ params }) => {
      return getCharacterProfilePayload(params.realm, params.name);
    },
    {
      params: t.Object({
        realm: t.String(),
        name: t.String(),
      }),
    },
  )

  // ── Stream Single Character Updates (SSE) ──────────────────────────
  .get(
    "/:realm/:name/stream",
    async ({ params, request }) => {
      return createSseResponse({
        request,
        subscribe: subscribeProcessingUpdates,
        loadSnapshot: () => getCharacterProfilePayload(params.realm, params.name),
        snapshotErrorMessage: "Failed to load character state",
      });
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
            deepScanStatus: "pending",
            currentStep: "Queued",
            stepsCompleted: [],
            errorMessage: null,
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

      publishProcessingUpdate();
      publishUserQueuedUpdate(user.id);

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

        publishProcessingUpdate();
        publishUserQueuedUpdate(user.id);

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
