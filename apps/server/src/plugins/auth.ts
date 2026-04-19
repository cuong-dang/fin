import fastifyJwt from "@fastify/jwt";
import fastifyOauth2, { type OAuth2Namespace } from "@fastify/oauth2";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { db, schema } from "../db";
import { env } from "../env";

/** JWT payload. Identifies the user; the active workspace is per-request. */
type JwtPayload = {
  userId: string;
  email: string;
  name: string;
};

/**
 * Resolved auth context on a workspace-scoped request: the JWT's user
 * fields plus a `groupId` verified against `group_members`.
 */
type AuthContext = JwtPayload & { groupId: string };

declare module "fastify" {
  interface FastifyRequest {
    /** Present on routes protected by `authenticateUser` (JWT only). */
    user: JwtPayload;
    /** Present on routes protected by `authenticate` (JWT + group membership). */
    auth: AuthContext;
  }
  interface FastifyInstance {
    /** Verifies the JWT only. Attaches `req.user`. */
    authenticateUser: (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    /**
     * Verifies the JWT and the `X-Group-Id` header against group_members.
     * Attaches `req.auth` (user fields + groupId). Use for all routes that
     * read or write workspace-scoped data.
     */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    googleOAuth2: OAuth2Namespace;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
  }
}

const GROUP_HEADER = "x-group-id";

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.AUTH_SECRET,
    sign: { expiresIn: "30d" },
  });

  await app.register(fastifyOauth2, {
    name: "googleOAuth2",
    scope: ["openid", "email", "profile"],
    credentials: {
      client: { id: env.AUTH_GOOGLE_ID, secret: env.AUTH_GOOGLE_SECRET },
      auth: fastifyOauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: "/api/auth/google/start",
    callbackUri: `http://localhost:${env.PORT}/api/auth/google/callback`,
  });

  app.decorate(
    "authenticateUser",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        req.user = await req.jwtVerify<JwtPayload>();
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    },
  );

  app.decorate(
    "authenticate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      let payload: JwtPayload;
      try {
        payload = await req.jwtVerify<JwtPayload>();
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const headerVal = req.headers[GROUP_HEADER];
      const groupId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
      if (!groupId) {
        return reply.code(400).send({ error: "Missing X-Group-Id header" });
      }

      const [membership] = await db
        .select({ groupId: schema.groupMembers.groupId })
        .from(schema.groupMembers)
        .where(
          and(
            eq(schema.groupMembers.userId, payload.userId),
            eq(schema.groupMembers.groupId, groupId),
          ),
        )
        .limit(1);
      if (!membership) {
        return reply.code(403).send({ error: "Not a member of this group" });
      }

      req.user = payload;
      req.auth = { ...payload, groupId };
    },
  );
});
