import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe portion of the Auth.js config. This file (and its imports) must
// not import anything Node-only — the proxy runs on the edge and pulls this.
export default {
  providers: [Google],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  pages: {
    signIn: "/signin",
  },
} satisfies NextAuthConfig;
