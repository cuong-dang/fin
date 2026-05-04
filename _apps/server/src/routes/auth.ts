import { type Me } from "@fin/schemas";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { db, schema } from "../db";
import { env } from "../env";
import { bootstrapSession } from "../lib/session";

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
  // one and sends it as `X-Group-Id` on subsequent requests.
  app.get(
    "/me",
    { preHandler: [app.authenticateUser] },
    async (req): Promise<Me> => {
      const groups = await db
        .select({
          id: schema.groups.id,
          name: schema.groups.name,
          role: schema.groupMembers.role,
        })
        .from(schema.groupMembers)
        .innerJoin(
          schema.groups,
          eq(schema.groups.id, schema.groupMembers.groupId),
        )
        .where(eq(schema.groupMembers.userId, req.user.userId))
        .orderBy(schema.groupMembers.createdAt);

      return { user: req.user, groups };
    },
  );
};
