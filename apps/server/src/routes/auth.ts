import { type Me } from "@fin/schemas";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { db, schema } from "../db/index.js";
import { env } from "../env.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  // /api/auth/google/start is registered automatically by @fastify/oauth2 —
  // the plugin creates the 302 redirect there. Nothing to do in this file.

  // OAuth callback: Google redirects here with ?code=...
  app.get("/google/callback", async (req, reply) => {
    const { token: googleToken } =
      await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(req);

    // Fetch the Google profile with the access token.
    const profileRes = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${googleToken.access_token}` } },
    );
    if (!profileRes.ok) {
      return reply.code(502).send({ error: "Failed to fetch Google profile" });
    }
    const profile = (await profileRes.json()) as {
      email?: string;
      name?: string;
    };
    if (!profile.email) {
      return reply.code(400).send({ error: "Google profile has no email" });
    }

    const user = await bootstrapSession(
      profile.email,
      profile.name ?? profile.email,
    );
    const token = app.jwt.sign(user);

    // Hand the token to the web app via URL fragment (client-only; never
    // sent back to the server).
    return reply.redirect(`${env.WEB_ORIGIN}/auth/callback#token=${token}`);
  });

  // Authenticated user + the workspaces they belong to. The client picks
  // one and sends it as `X-Workspace-Id` on subsequent requests.
  app.get(
    "/me",
    { preHandler: [app.authenticateUser] },
    async (req): Promise<Me> => {
      const workspaces = await db
        .select({
          id: schema.workspaces.id,
          name: schema.workspaces.name,
          role: schema.workspaceMembers.role,
        })
        .from(schema.workspaceMembers)
        .innerJoin(
          schema.workspaces,
          eq(schema.workspaces.id, schema.workspaceMembers.workspaceId),
        )
        .where(eq(schema.workspaceMembers.userId, req.user.userId))
        .orderBy(schema.workspaceMembers.createdAt);

      return { user: req.user, workspaces: workspaces };
    },
  );
};

type BootstrappedUser = {
  userId: string;
  email: string;
  name: string;
};

/**
 * Resolve the user for a just-authenticated login. If new, create the user
 * row + a default "Personal" workspace with owner membership in a single
 * transaction. If existing, just look the user up.
 *
 * Concurrency: `ON CONFLICT DO NOTHING` on `users.email` serializes races.
 * The winner inserts user + workspace + membership atomically; the loser's
 * INSERT no-ops and its SELECT then sees the winner's committed row.
 */
async function bootstrapSession(
  email: string,
  name: string,
): Promise<BootstrappedUser> {
  return db.transaction(async (tx) => {
    // ON CONFLICT DO NOTHING: returns one row on a fresh insert, zero
    // rows when the email collided with an existing user.
    const [winner] = await tx
      .insert(schema.users)
      .values({ email, name })
      .onConflictDoNothing({ target: schema.users.email })
      .returning({ id: schema.users.id });

    if (winner) {
      // Winner path: create Personal workspace + owner membership atomically.
      const [workspace] = await tx
        .insert(schema.workspaces)
        .values({ name: "Personal" })
        .returning({ id: schema.workspaces.id });
      await tx.insert(schema.workspaceMembers).values({
        workspaceId: workspace.id,
        userId: winner.id,
        role: "owner",
      });
      return { userId: winner.id, email, name };
    }

    // Loser (or repeat login) path: the user already exists.
    const [user] = await tx
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return { userId: user.id, email: user.email, name: user.name };
  });
}
