// ─── Auth Helpers ────────────────────────────────────────────────────────
import { eq } from "drizzle-orm";
import { db } from "../db";
import { oauthAccounts } from "../db/schema";

const BATTLENET_CLIENT_ID = process.env.BATTLENET_CLIENT_ID!;
const BATTLENET_CLIENT_SECRET = process.env.BATTLENET_CLIENT_SECRET!;

/**
 * Refresh a Battle.net OAuth token using the stored refresh token.
 * Updates the database row and returns the new access token.
 */
export async function refreshBattleNetToken(oauthAccountId: string, refreshToken: string): Promise<string> {
  const response = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: BATTLENET_CLIENT_ID,
      client_secret: BATTLENET_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Battle.net token refresh failed: ${response.status} ${text}`);
  }

  const data: { access_token: string; refresh_token?: string; expires_in?: number } = await response.json();

  await db
    .update(oauthAccounts)
    .set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    })
    .where(eq(oauthAccounts.id, oauthAccountId));

  return data.access_token;
}
