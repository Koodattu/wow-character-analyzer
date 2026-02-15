import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { db } from "../db";
import { sessions, users } from "../db/schema";

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: "auth_session",
    attributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  },
  getUserAttributes: (attributes) => ({
    username: attributes.username,
    avatarUrl: attributes.avatar_url,
    isAdmin: attributes.is_admin,
  }),
});

export async function validateSession(sessionId: string) {
  const result = await lucia.validateSession(sessionId);
  return result;
}

// Module augmentation for Lucia types
declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      username: string | null;
      avatar_url: string | null;
      is_admin: boolean;
    };
  }
}
