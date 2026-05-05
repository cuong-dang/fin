import fastifyJwt from "@fastify/jwt";
import fastifyOauth2, { type OAuth2Namespace } from "@fastify/oauth2";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { db, schema } from "../db/index.js";
import { env } from "../env.js";

/** JWT payload. Identifies the user; the active workspace is per-request. */
type JwtPayload = {
  userId: string;
  email: string;
  name: string;
};

/**
 * Resolved auth context on a workspace-scoped request: the JWT's user
 * fields plus a `workspaceId` verified against `workspace_members`.
 */
type AuthContext = JwtPayload & { workspaceId: string };

declare module "fastify" {
  interface FastifyRequest {
    /** Present on routes protected by `authenticateUser` (JWT only). */
    user: JwtPayload;
    /** Present on routes protected by `authenticate` (JWT + workspace membership). */
    auth: AuthContext;
  }
  interface FastifyInstance {
    /** Verifies the JWT only. Attaches `req.user`. */
    authenticateUser: (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    /**
     * Verifies the JWT and the `X-Workspace-Id` header against workspace_members.
     * Attaches `req.auth` (user fields + workspaceId). Use for all routes that
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

const WORKSPACE_HEADER = "x-workspace-id";

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.AUTH_SECRET,
    sign: { expiresIn: "30d" },
  });

  // The bundled `fastifyOauth2.GOOGLE_CONFIGURATION` preset is declared
  // on the `FastifyOauth2` interface but @fastify/oauth2's `export =`
  // points at a plain function declaration that doesn't carry those
  // static props through TS. Inlining Google's well-known OAuth 2.0
  // endpoints sidesteps the typing gap; values match the preset
  // verbatim and have been stable since ~2014.
  const googleAuth: fastifyOauth2.ProviderConfiguration = {
    authorizeHost: "https://accounts.google.com",
    authorizePath: "/o/oauth2/v2/auth",
    tokenHost: "https://www.googleapis.com",
    tokenPath: "/oauth2/v4/token",
  };

  await app.register(fastifyOauth2, {
    name: "googleOAuth2",
    scope: ["openid", "email", "profile"],
    credentials: {
      client: { id: env.AUTH_GOOGLE_ID, secret: env.AUTH_GOOGLE_SECRET },
      auth: googleAuth,
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

      const headerVal = req.headers[WORKSPACE_HEADER];
      const workspaceId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
      if (!workspaceId) {
        return reply.code(400).send({ error: "Missing X-Workspace-Id header" });
      }

      const [membership] = await db
        .select({ workspaceId: schema.workspaceMembers.workspaceId })
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.userId, payload.userId),
            eq(schema.workspaceMembers.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!membership) {
        return reply
          .code(403)
          .send({ error: "Not a member of this workspace" });
      }

      req.user = payload;
      req.auth = { ...payload, workspaceId };
    },
  );
});
