import { Elysia } from "elysia";
import { lucia, validateSession } from "./lucia";
import type { Session, User } from "lucia";

export const authPlugin = new Elysia({ name: "auth" })
  .derive(async ({ cookie }): Promise<{ user: User | null; session: Session | null }> => {
    const sessionId = cookie?.auth_session?.value;

    if (!sessionId || typeof sessionId !== "string") {
      return { user: null, session: null };
    }

    const { session, user } = await validateSession(sessionId);

    if (session && session.fresh) {
      const sessionCookie = lucia.createSessionCookie(session.id);
      cookie.auth_session?.set({
        value: sessionCookie.value,
        ...sessionCookie.attributes,
      });
    }

    if (!session) {
      const blankCookie = lucia.createBlankSessionCookie();
      cookie.auth_session?.set({
        value: blankCookie.value,
        ...blankCookie.attributes,
      });
    }

    return { user, session };
  })
  .as("global");

export const requireAuth = new Elysia({ name: "requireAuth" })
  .use(authPlugin)
  .derive(({ set, user, session }) => {
    if (!user || !session) {
      set.status = 401;
      throw new Error("Unauthorized");
    }
    return { user: user as User, session: session as Session };
  })
  .as("global");

export const requireAdmin = new Elysia({ name: "requireAdmin" })
  .use(authPlugin)
  .derive(({ set, user, session }) => {
    if (!user || !session) {
      set.status = 401;
      throw new Error("Unauthorized");
    }
    if (!(user as User).isAdmin) {
      set.status = 403;
      throw new Error("Forbidden");
    }
    return { user: user as User, session: session as Session };
  })
  .as("global");
