import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { groupMembers, users } from "@/db/schema";

export type CurrentSession = {
  userId: string;
  groupId: string | null;
  email: string;
  name: string;
};

/**
 * Resolve the signed-in user + their primary group. Returns null if there is
 * no session (the proxy should prevent this from rendering in protected
 * routes, but callers should still handle null defensively).
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const session = await auth();
  if (!session?.user?.email) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);
  if (!user) return null;

  const [membership] = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, user.id))
    .orderBy(groupMembers.createdAt)
    .limit(1);

  return {
    userId: user.id,
    groupId: membership?.groupId ?? null,
    email: user.email,
    name: user.name,
  };
}
