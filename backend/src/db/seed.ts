// ─── Database Seed Script ──────────────────────────────────────────────
// Run with: bun run src/db/seed.ts
import { db } from "./index";
import { expansions, seasons, raids, bosses, dungeons } from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("[Seed] Starting database seed...");

  // ── The War Within ─────────────────────────────────────────────────
  const [tww] = await db
    .insert(expansions)
    .values({
      name: "The War Within",
      slug: "tww",
      sortOrder: 2,
    })
    .onConflictDoNothing()
    .returning();

  const twwId =
    tww?.id ??
    (await db
      .select()
      .from(expansions)
      .where(eq(expansions.slug, "tww"))
      .then((r) => r[0]?.id));

  if (twwId) {
    // TWW Season 1
    const [twwS1] = await db.insert(seasons).values({ expansionId: twwId, name: "Season 1", slug: "tww-s1", number: 1 }).onConflictDoNothing().returning();
    const twwS1Id =
      twwS1?.id ??
      (await db
        .select()
        .from(seasons)
        .where(eq(seasons.slug, "tww-s1"))
        .then((r) => r[0]?.id));

    if (twwS1Id) {
      // Nerub-ar Palace
      const [nap] = await db
        .insert(raids)
        .values({ seasonId: twwS1Id, name: "Nerub-ar Palace", slug: "nerub-ar-palace", wclZoneId: 38, sortOrder: 1 })
        .onConflictDoNothing()
        .returning();
      const napId =
        nap?.id ??
        (await db
          .select()
          .from(raids)
          .where(eq(raids.slug, "nerub-ar-palace"))
          .then((r) => r[0]?.id));

      if (napId) {
        const napBosses = [
          { name: "Ulgrax the Devourer", slug: "ulgrax", wclEncounterId: 2902, sortOrder: 1 },
          { name: "The Bloodbound Horror", slug: "bloodbound-horror", wclEncounterId: 2917, sortOrder: 2 },
          { name: "Sikran", slug: "sikran", wclEncounterId: 2898, sortOrder: 3 },
          { name: "Rasha'nan", slug: "rashanan", wclEncounterId: 2918, sortOrder: 4 },
          { name: "Broodtwister Ovi'nax", slug: "broodtwister-ovinax", wclEncounterId: 2919, sortOrder: 5 },
          { name: "Nexus-Princess Ky'veza", slug: "nexus-princess-kyveza", wclEncounterId: 2920, sortOrder: 6 },
          { name: "The Silken Court", slug: "silken-court", wclEncounterId: 2921, sortOrder: 7 },
          { name: "Queen Ansurek", slug: "queen-ansurek", wclEncounterId: 2922, sortOrder: 8 },
        ];
        for (const boss of napBosses) {
          await db
            .insert(bosses)
            .values({ raidId: napId, ...boss })
            .onConflictDoNothing();
        }
      }
    }

    // TWW Season 2
    const [twwS2] = await db.insert(seasons).values({ expansionId: twwId, name: "Season 2", slug: "tww-s2", number: 2 }).onConflictDoNothing().returning();
    const twwS2Id =
      twwS2?.id ??
      (await db
        .select()
        .from(seasons)
        .where(eq(seasons.slug, "tww-s2"))
        .then((r) => r[0]?.id));

    if (twwS2Id) {
      // Liberation of Undermine
      const [lou] = await db
        .insert(raids)
        .values({ seasonId: twwS2Id, name: "Liberation of Undermine", slug: "liberation-of-undermine", wclZoneId: 39, sortOrder: 1 })
        .onConflictDoNothing()
        .returning();
      const louId =
        lou?.id ??
        (await db
          .select()
          .from(raids)
          .where(eq(raids.slug, "liberation-of-undermine"))
          .then((r) => r[0]?.id));

      if (louId) {
        const louBosses = [
          { name: "Vexie and the Geargrinders", slug: "vexie", wclEncounterId: 3009, sortOrder: 1 },
          { name: "Cauldron of Carnage", slug: "cauldron-of-carnage", wclEncounterId: 3010, sortOrder: 2 },
          { name: "Rik Reverb", slug: "rik-reverb", wclEncounterId: 3011, sortOrder: 3 },
          { name: "Stix Bunkjunker", slug: "stix-bunkjunker", wclEncounterId: 3012, sortOrder: 4 },
          { name: "The Sprocketmonger", slug: "sprocketmonger", wclEncounterId: 3013, sortOrder: 5 },
          { name: "Crowd Pummeler 9-60", slug: "crowd-pummeler", wclEncounterId: 3014, sortOrder: 6 },
          { name: "Mug'Zee, Heads of Security", slug: "mugzee", wclEncounterId: 3015, sortOrder: 7 },
          { name: "Gallagio", slug: "gallagio", wclEncounterId: 3016, sortOrder: 8 },
        ];
        for (const boss of louBosses) {
          await db
            .insert(bosses)
            .values({ raidId: louId, ...boss })
            .onConflictDoNothing();
        }
      }

      // TWW S2 Dungeons
      const twwS2Dungeons = [
        { name: "Cinderbrew Meadery", slug: "cinderbrew-meadery", sortOrder: 1 },
        { name: "Darkflame Cleft", slug: "darkflame-cleft", sortOrder: 2 },
        { name: "The Rookery", slug: "the-rookery", sortOrder: 3 },
        { name: "Priory of the Sacred Flame", slug: "priory-sacred-flame", sortOrder: 4 },
        { name: "Operation: Floodgate", slug: "operation-floodgate", sortOrder: 5 },
        { name: "The MOTHERLODE!!", slug: "the-motherlode", sortOrder: 6 },
        { name: "Mechagon Workshop", slug: "mechagon-workshop", sortOrder: 7 },
        { name: "Theater of Pain", slug: "theater-of-pain", sortOrder: 8 },
      ];
      for (const dungeon of twwS2Dungeons) {
        await db
          .insert(dungeons)
          .values({ seasonId: twwS2Id, ...dungeon })
          .onConflictDoNothing();
      }
    }
  }

  // ── Dragonflight ───────────────────────────────────────────────────
  const [df] = await db
    .insert(expansions)
    .values({
      name: "Dragonflight",
      slug: "df",
      sortOrder: 1,
    })
    .onConflictDoNothing()
    .returning();

  const dfId =
    df?.id ??
    (await db
      .select()
      .from(expansions)
      .where(eq(expansions.slug, "df"))
      .then((r) => r[0]?.id));

  if (dfId) {
    const dfSeasons = [
      { name: "Season 1", slug: "df-s1", number: 1 },
      { name: "Season 2", slug: "df-s2", number: 2 },
      { name: "Season 3", slug: "df-s3", number: 3 },
      { name: "Season 4", slug: "df-s4", number: 4 },
    ];
    for (const season of dfSeasons) {
      await db
        .insert(seasons)
        .values({ expansionId: dfId, ...season })
        .onConflictDoNothing();
    }
  }

  console.log("[Seed] Database seeded successfully!");
}

export { seed };

// Allow running as a standalone script: bun run src/db/seed.ts
if (import.meta.main) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Seed] Failed:", err);
      process.exit(1);
    });
}
