// ─── User Routes ───────────────────────────────────────────────────────
import { Elysia, t } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { oauthAccounts, characters, characterQueue, processingState } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { fetchUserCharacters } from "../services/blizzard";
import { refreshBattleNetToken } from "../auth/helpers";

export const userRoutes = new Elysia({ prefix: "/api/user" })
  .use(requireAuth)

  // ── Get User's WoW Characters from Linked Battle.net ────────────────
  .get("/characters", async ({ user, set }) => {
    // Find Battle.net OAuth account
    const [bnetAccount] = await db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, user.id), eq(oauthAccounts.provider, "battlenet")))
      .limit(1);

    if (!bnetAccount?.accessToken) {
      set.status = 400;
      return {
        error: "No Battle.net account linked. Please link your Battle.net account first.",
        linked: false,
      };
    }

    // Refresh token if expired or about to expire
    let token = bnetAccount.accessToken;
    if (bnetAccount.expiresAt && bnetAccount.expiresAt.getTime() < Date.now() + 60_000) {
      if (bnetAccount.refreshToken) {
        try {
          token = await refreshBattleNetToken(bnetAccount.id, bnetAccount.refreshToken);
        } catch (e) {
          console.warn("[User] Token refresh failed, using existing token", e);
        }
      }
    }

    try {
      const wowCharacters = await fetchUserCharacters(token);

      // Filter to level 70+ characters
      const filtered = wowCharacters
        .filter((c) => c.level >= 70)
        .map((c) => ({
          id: c.character.id,
          name: c.character.name,
          realm: c.character.realm.name,
          realmSlug: c.character.realm.slug,
          faction: c.faction.type.toLowerCase(),
          className: c.playable_class.name,
          level: c.level,
        }))
        .sort((a, b) => b.level - a.level);

      return { characters: filtered, linked: true };
    } catch (error) {
      console.error("[User] Failed to fetch Bnet characters:", error);
      set.status = 500;
      return { error: "Failed to fetch characters from Battle.net", linked: true };
    }
  })

  // ── Get User's Queued Characters ────────────────────────────────────
  .get("/queued", async ({ user }) => {
    const results = await db
      .select({
        queueId: characterQueue.id,
        queueStatus: characterQueue.status,
        queuedAt: characterQueue.createdAt,
        characterId: characters.id,
        characterName: characters.name,
        characterRealm: characters.realm,
        characterRealmSlug: characters.realmSlug,
        className: characters.className,
        faction: characters.faction,
        profilePicUrl: characters.profilePicUrl,
        lightweightStatus: processingState.lightweightStatus,
        deepScanStatus: processingState.deepScanStatus,
        currentStep: processingState.currentStep,
        stepsCompleted: processingState.stepsCompleted,
        totalSteps: processingState.totalSteps,
      })
      .from(characterQueue)
      .innerJoin(characters, eq(characterQueue.characterId, characters.id))
      .leftJoin(processingState, eq(characters.id, processingState.characterId))
      .where(eq(characterQueue.queuedById, user.id))
      .orderBy(desc(characterQueue.createdAt))
      .limit(50);

    return { queuedCharacters: results };
  })

  // ── Check Battle.net Link Status ────────────────────────────────────
  .get("/bnet-status", async ({ user }) => {
    const [bnetAccount] = await db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, user.id), eq(oauthAccounts.provider, "battlenet")))
      .limit(1);

    return {
      linked: !!bnetAccount,
      battletag: bnetAccount ? undefined : null,
    };
  });
