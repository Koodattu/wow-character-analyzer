import { Elysia } from "elysia";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { lucia } from "./lucia";
import { authPlugin } from "./middleware";
import { db } from "../db";
import { users, oauthAccounts } from "../db/schema";

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

async function findOrCreateUser(
  provider: "discord" | "battlenet",
  providerAccountId: string,
  accessToken: string,
  refreshToken: string | undefined,
  expiresAt: Date | undefined,
  username: string | null,
  avatarUrl: string | null,
): Promise<string> {
  // Check if an OAuth account already exists
  const existing = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId)))
    .limit(1);

  if (existing.length > 0) {
    const userId = existing[0].userId;

    // Update tokens
    await db
      .update(oauthAccounts)
      .set({
        accessToken,
        refreshToken: refreshToken ?? null,
        expiresAt: expiresAt ?? null,
      })
      .where(eq(oauthAccounts.id, existing[0].id));

    // Update user info
    await db
      .update(users)
      .set({
        username: username ?? undefined,
        avatarUrl: avatarUrl ?? undefined,
      })
      .where(eq(users.id, userId));

    return userId;
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

  .get("/discord/callback", async ({ query, cookie, set, redirect }) => {
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
      );

      const session = await lucia.createSession(userId, {});
      const sessionCookie = lucia.createSessionCookie(session.id);

      cookie.auth_session.set({
        value: sessionCookie.value,
        ...sessionCookie.attributes,
      });

      return redirect(FRONTEND_URL);
    } catch (error) {
      console.error("Discord OAuth callback error:", error);
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
      scope: "openid",
      state,
    });

    return redirect(`https://oauth.battle.net/authorize?${params.toString()}`);
  })

  .get("/battlenet/callback", async ({ query, cookie, set, redirect }) => {
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
      );

      const session = await lucia.createSession(userId, {});
      const sessionCookie = lucia.createSessionCookie(session.id);

      cookie.auth_session.set({
        value: sessionCookie.value,
        ...sessionCookie.attributes,
      });

      return redirect(FRONTEND_URL);
    } catch (error) {
      console.error("Battle.net OAuth callback error:", error);
      set.status = 500;
      return { error: "Authentication failed" };
    }
  })

  // ── Logout ──────────────────────────────────────────────────────────
  .post("/logout", async ({ session, cookie }: any) => {
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
  .get("/me", ({ user }: any) => {
    if (!user) {
      return { user: null };
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
      },
    };
  });
