import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { db } from "./db";
import { users } from "./db/schema";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      // Restrict sign-in to emails already present in our users table.
      // New members must be added via seed or (later) an owner-only invite flow.
      if (!user.email) return false;
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, user.email))
        .limit(1);
      return !!existing;
    },
    async jwt({ token, user }) {
      // On first sign-in `user` is populated with Google profile info.
      // Resolve our DB user id once and stash it on the token.
      if (user?.email) {
        const [row] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1);
        if (row) token.userId = row.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
