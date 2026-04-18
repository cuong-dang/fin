import NextAuth from "next-auth";
import authConfig from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Run on all paths except Next.js internals, auth endpoints, the sign-in
  // page, and static files with a file extension.
  matcher: [
    "/((?!api/auth|signin|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
