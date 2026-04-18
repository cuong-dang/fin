import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { groupMembers, groups, users } from "@/db/schema";

export type CurrentSession = {
  userId: string;
  groupId: string;
  email: string;
  name: string;
};

/**
 * Resolve the signed-in user + their primary group. Returns null if there is
 * no session. If the user has no group membership yet (first sign-in), a
 * "Personal" group is created on the fly — so a non-null return always
 * carries a valid groupId.
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

  const groupId = membership?.groupId ?? (await createPersonalGroup(user.id));

  return {
    userId: user.id,
    groupId,
    email: user.email,
    name: user.name,
  };
}

/**
 * Atomically create a "Personal" group + owner membership for a user with no
 * group. Re-checks inside the transaction so concurrent requests from the
 * same new user don't produce duplicate groups.
 */
async function createPersonalGroup(userId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId))
      .orderBy(groupMembers.createdAt)
      .limit(1);
    if (existing) return existing.groupId;

    const [group] = await tx
      .insert(groups)
      .values({ name: "Personal" })
      .returning({ id: groups.id });
    await tx.insert(groupMembers).values({
      groupId: group.id,
      userId,
      role: "owner",
    });
    return group.id;
  });
}
