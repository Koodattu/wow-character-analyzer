// ─── User Routes ───────────────────────────────────────────────────────
import { Elysia, t } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { oauthAccounts, characters, characterQueue, processingState } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { fetchUserCharacters } from "../services/blizzard";
import { refreshBattleNetToken } from "../auth/helpers";
import { log } from "../lib/logger";
import { subscribeUserQueuedUpdates } from "../lib/sse";

const sseEncoder = new TextEncoder();

async function getQueuedCharactersForUser(userId: string) {
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
      errorMessage: processingState.errorMessage,
    })
    .from(characterQueue)
    .innerJoin(characters, eq(characterQueue.characterId, characters.id))
    .leftJoin(processingState, eq(characters.id, processingState.characterId))
    .where(eq(characterQueue.queuedById, userId))
    .orderBy(desc(characterQueue.createdAt))
    .limit(50);

  return results;
}

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
          log.warn({ err: e }, "Token refresh failed, using existing token");
        }
      }
    }

    try {
      const wowCharacters = await fetchUserCharacters(token);

      // Filter to level 70+ characters with valid data
      const filtered = wowCharacters
        .filter((c) => {
          // Ensure character has all required properties
          if (!c.realm || !c.faction || !c.playable_class || !c.name) {
            log.warn({ character: c }, "Skipping character with missing data");
            return false;
          }
          return c.level >= 70;
        })
        .map((c) => ({
          id: c.id,
          name: c.name,
          realm: c.realm.name,
          realmSlug: c.realm.slug,
          faction: c.faction.type.toLowerCase(),
          className: c.playable_class.name,
          level: c.level,
        }))
        .sort((a, b) => b.level - a.level);

      log.info({ count: filtered.length, total: wowCharacters.length }, "Filtered user characters");
      return { characters: filtered, linked: true };
    } catch (error) {
      log.error({ err: error }, "Failed to fetch Bnet characters");
      set.status = 500;
      return { error: "Failed to fetch characters from Battle.net", linked: true };
    }
  })

  // ── Get User's Queued Characters ────────────────────────────────────
  .get("/queued", async ({ user }) => {
    const results = await getQueuedCharactersForUser(user.id);
    return { queuedCharacters: results };
  })

  // ── Stream User's Queue Updates (SSE) ───────────────────────────────
  .get("/queued/stream", async ({ user, request }) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        const sendEvent = (event: "snapshot" | "update" | "error", payload: unknown) => {
          if (closed) return;
          controller.enqueue(sseEncoder.encode(`event: ${event}\n`));
          controller.enqueue(sseEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        const sendSnapshot = async (event: "snapshot" | "update") => {
          try {
            const queuedCharacters = await getQueuedCharactersForUser(user.id);
            sendEvent(event, { queuedCharacters });
          } catch {
            sendEvent("error", { error: "Failed to load queue state" });
          }
        };

        const unsubscribe = subscribeUserQueuedUpdates(user.id, () => {
          void sendSnapshot("update");
        });

        const heartbeat = setInterval(() => {
          if (closed) return;
          controller.enqueue(sseEncoder.encode(": ping\n\n"));
        }, 15000);

        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // stream already closed
          }
        };

        request.signal.addEventListener("abort", close, { once: true });
        void sendSnapshot("snapshot");
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
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
