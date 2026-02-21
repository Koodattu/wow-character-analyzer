import { Elysia, t } from "elysia";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { lucia } from "./lucia";
import { authPlugin } from "./middleware";
import { db } from "../db";
import { users, oauthAccounts } from "../db/schema";
import { log } from "../lib/logger";

// ─── Environment Variables ───────────────────────────────────────────────
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;

const BATTLENET_CLIENT_ID = process.env.BATTLENET_CLIENT_ID!;
const BATTLENET_CLIENT_SECRET = process.env.BATTLENET_CLIENT_SECRET!;
const BATTLENET_REDIRECT_URI = process.env.BATTLENET_REDIRECT_URI!;

const ADMIN_DISCORD_IDS = (process.env.ADMIN_DISCORD_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// ─── Helpers ─────────────────────────────────────────────────────────────
function generateState(): string {
  return createId();
}

async function exchangeCode(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function getDiscordUser(accessToken: string): Promise<{
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
}> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Discord user: ${response.status}`);
  }

  return response.json();
}

async function getBattleNetUser(accessToken: string): Promise<{
  sub: string;
  battletag?: string;
}> {
  const response = await fetch("https://oauth.battle.net/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Battle.net user: ${response.status}`);
  }

  return response.json();
}

/**
 * Find or create a user for the given OAuth provider.
 * If `currentUserId` is provided (user is already logged in), the provider
 * account is linked to the existing user instead of creating a new one.
 */
async function findOrCreateUser(
  provider: "discord" | "battlenet",
  providerAccountId: string,
  accessToken: string,
  refreshToken: string | undefined,
  expiresAt: Date | undefined,
  username: string | null,
  avatarUrl: string | null,
  currentUserId?: string | null,
): Promise<string> {
  // Check if an OAuth account already exists for this provider + ID
  const existing = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId)))
    .limit(1);

  if (existing.length > 0) {
    const existingAccount = existing[0];

    // If user is logged in and the provider account belongs to a DIFFERENT user,
    // re-link the provider account to the current user (account merge scenario).
    if (currentUserId && existingAccount.userId !== currentUserId) {
      await db
        .update(oauthAccounts)
        .set({
          userId: currentUserId,
          accessToken,
          refreshToken: refreshToken ?? null,
          expiresAt: expiresAt ?? null,
        })
        .where(eq(oauthAccounts.id, existingAccount.id));

      // Recalculate admin status on re-link
      if (provider === "discord") {
        const shouldBeAdmin = ADMIN_DISCORD_IDS.includes(providerAccountId);
        await db.update(users).set({ isAdmin: shouldBeAdmin }).where(eq(users.id, currentUserId));
      }

      return currentUserId;
    }

    const userId = existingAccount.userId;

    // Update tokens
    await db
      .update(oauthAccounts)
      .set({
        accessToken,
        refreshToken: refreshToken ?? null,
        expiresAt: expiresAt ?? null,
      })
      .where(eq(oauthAccounts.id, existingAccount.id));

    // Recalculate admin status on every Discord login
    if (provider === "discord") {
      const shouldBeAdmin = ADMIN_DISCORD_IDS.includes(providerAccountId);
      await db
        .update(users)
        .set({
          username: username ?? undefined,
          avatarUrl: avatarUrl ?? undefined,
          isAdmin: shouldBeAdmin,
        })
        .where(eq(users.id, userId));
    } else {
      await db
        .update(users)
        .set({
          username: username ?? undefined,
          avatarUrl: avatarUrl ?? undefined,
        })
        .where(eq(users.id, userId));
    }

    return userId;
  }

  // No existing OAuth account for this provider+ID.
  // If the user is already logged in, link to their existing account.
  if (currentUserId) {
    // Check admin status for Discord linking
    if (provider === "discord" && ADMIN_DISCORD_IDS.includes(providerAccountId)) {
      await db.update(users).set({ isAdmin: true }).where(eq(users.id, currentUserId));
    }

    await db.insert(oauthAccounts).values({
      userId: currentUserId,
      provider,
      providerAccountId,
      accessToken,
      refreshToken: refreshToken ?? null,
      expiresAt: expiresAt ?? null,
    });

    return currentUserId;
  }

  // Create new user
  const isAdmin = provider === "discord" && ADMIN_DISCORD_IDS.includes(providerAccountId);

  const userId = createId();

  await db.insert(users).values({
    id: userId,
    username,
    avatarUrl,
    isAdmin,
  });

  await db.insert(oauthAccounts).values({
    userId,
    provider,
    providerAccountId,
    accessToken,
    refreshToken: refreshToken ?? null,
    expiresAt: expiresAt ?? null,
  });

  return userId;
}

/**
 * Get linked providers for a user.
 */
async function getLinkedProviders(userId: string) {
  const accounts = await db
    .select({
      provider: oauthAccounts.provider,
      providerAccountId: oauthAccounts.providerAccountId,
      createdAt: oauthAccounts.createdAt,
    })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId));

  return {
    discord: accounts.find((a) => a.provider === "discord") ?? null,
    battlenet: accounts.find((a) => a.provider === "battlenet") ?? null,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────
export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(authPlugin)

  // ── Discord OAuth2 ──────────────────────────────────────────────────
  .get("/discord", ({ cookie, redirect }) => {
    const state = generateState();

    cookie.oauth_state.set({
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10, // 10 minutes
    });

    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: "code",
      scope: "identify",
      state,
    });

    return redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
  })

  .get("/discord/callback", async (ctx) => {
    const { query, cookie, set, redirect, user: currentUser } = ctx as typeof ctx & { redirect: (url: string) => Response };
    const { code, state } = query as { code?: string; state?: string };
    const storedState = cookie?.oauth_state?.value;

    if (!code || !state || state !== storedState) {
      set.status = 400;
      return { error: "Invalid OAuth state or missing code" };
    }

    // Clear the state cookie
    cookie.oauth_state.set({
      value: "",
      maxAge: 0,
      path: "/",
    });

    try {
      const tokens = await exchangeCode("https://discord.com/api/oauth2/token", DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, code, DISCORD_REDIRECT_URI);

      const discordUser = await getDiscordUser(tokens.access_token);

      const avatarUrl = discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null;

      const username = discordUser.global_name ?? discordUser.username;

      const userId = await findOrCreateUser(
        "discord",
        discordUser.id,
        tokens.access_token,
        tokens.refresh_token,
        tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
        username,
        avatarUrl,
        currentUser?.id ?? null,
      );

      // Always create a fresh session after Discord login
      // (admin status or other attributes may have changed)
      if (currentUser?.id) {
        await lucia.invalidateSession(cookie.auth_session?.value ?? "");
      }
      const session = await lucia.createSession(userId, {});
      const sessionCookie = lucia.createSessionCookie(session.id);

      cookie.auth_session.set({
        value: sessionCookie.value,
        ...sessionCookie.attributes,
      });

      return redirect(`${FRONTEND_URL}/dashboard`);
    } catch (error) {
      log.error({ err: error }, "Discord OAuth callback error");
      set.status = 500;
      return { error: "Authentication failed" };
    }
  })

  // ── Battle.net OAuth2 ───────────────────────────────────────────────
  .get("/battlenet", ({ cookie, redirect }) => {
    const state = generateState();

    cookie.oauth_state.set({
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    const params = new URLSearchParams({
      client_id: BATTLENET_CLIENT_ID,
      redirect_uri: BATTLENET_REDIRECT_URI,
      response_type: "code",
      scope: "openid wow.profile",
      state,
    });

    return redirect(`https://oauth.battle.net/authorize?${params.toString()}`);
  })

  .get("/battlenet/callback", async (ctx) => {
    const { query, cookie, set, redirect, user: currentUser } = ctx as typeof ctx & { redirect: (url: string) => Response };
    const { code, state } = query as { code?: string; state?: string };
    const storedState = cookie?.oauth_state?.value;

    if (!code || !state || state !== storedState) {
      set.status = 400;
      return { error: "Invalid OAuth state or missing code" };
    }

    cookie.oauth_state.set({
      value: "",
      maxAge: 0,
      path: "/",
    });

    try {
      const tokens = await exchangeCode("https://oauth.battle.net/token", BATTLENET_CLIENT_ID, BATTLENET_CLIENT_SECRET, code, BATTLENET_REDIRECT_URI);

      const bnetUser = await getBattleNetUser(tokens.access_token);

      const userId = await findOrCreateUser(
        "battlenet",
        bnetUser.sub,
        tokens.access_token,
        tokens.refresh_token,
        tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
        bnetUser.battletag ?? null,
        null,
        currentUser?.id ?? null,
      );

      // Only create a new session if the user wasn't already logged in
      // or if the resolved user is different from the current one
      if (!currentUser || currentUser.id !== userId) {
        const session = await lucia.createSession(userId, {});
        const sessionCookie = lucia.createSessionCookie(session.id);

        cookie.auth_session.set({
          value: sessionCookie.value,
          ...sessionCookie.attributes,
        });
      }

      return redirect(`${FRONTEND_URL}/dashboard`);
    } catch (error) {
      log.error({ err: error }, "Battle.net OAuth callback error");
      set.status = 500;
      return { error: "Authentication failed" };
    }
  })

  // ── Logout ──────────────────────────────────────────────────────────
  .post("/logout", async ({ session, cookie }) => {
    if (session) {
      await lucia.invalidateSession(session.id);
    }

    const blankCookie = lucia.createBlankSessionCookie();
    cookie.auth_session.set({
      value: blankCookie.value,
      ...blankCookie.attributes,
    });

    return { success: true };
  })

  // ── Current User ────────────────────────────────────────────────────
  .get("/me", async ({ user }) => {
    if (!user) {
      return { user: null };
    }

    const providers = await getLinkedProviders(user.id);

    return {
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        linkedProviders: {
          discord: !!providers.discord,
          battlenet: !!providers.battlenet,
        },
      },
    };
  })

  // ── Unlink Provider ─────────────────────────────────────────────────
  .post("/unlink/:provider", async ({ params, user, session, set }) => {
    if (!user || !session) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const provider = params.provider as string;
    if (provider !== "discord" && provider !== "battlenet") {
      set.status = 400;
      return { error: "Invalid provider. Must be 'discord' or 'battlenet'." };
    }

    // Count how many providers the user has linked
    const allAccounts = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));

    if (allAccounts.length <= 1) {
      set.status = 400;
      return { error: "Cannot unlink your only login provider. Link another provider first." };
    }

    // Find and delete the provider account
    const targetAccount = allAccounts.find((a) => a.provider === provider);
    if (!targetAccount) {
      set.status = 404;
      return { error: `No ${provider} account linked.` };
    }

    await db.delete(oauthAccounts).where(eq(oauthAccounts.id, targetAccount.id));

    return { success: true };
  });
