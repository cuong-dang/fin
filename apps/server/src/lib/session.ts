import { eq } from "drizzle-orm";
import { db, schema } from "../db";

export type BootstrappedUser = {
  userId: string;
  email: string;
  name: string;
};

/**
 * Resolve the user for a just-authenticated login. If new, create the user
 * row + a default "Personal" group with owner membership in a single
 * transaction. If existing, just look the user up.
 *
 * Concurrency: `ON CONFLICT DO NOTHING` on `users.email` serializes races.
 * The winner inserts user + group + membership atomically; the loser's
 * INSERT no-ops and its SELECT then sees the winner's committed row.
 *
 * The active workspace is no longer chosen here — the client calls
 * `/api/auth/me` after receiving the token, picks one from the returned
 * list of memberships, and sends it per-request as `X-Group-Id`.
 */
export async function bootstrapSession(
  email: string,
  name: string,
): Promise<BootstrappedUser> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.users)
      .values({ email, name })
      .onConflictDoNothing({ target: schema.users.email })
      .returning({ id: schema.users.id });

    if (inserted.length > 0) {
      // Winner path: create Personal group + owner membership atomically.
      const userId = inserted[0].id;
      const [group] = await tx
        .insert(schema.groups)
        .values({ name: "Personal" })
        .returning({ id: schema.groups.id });
      await tx
        .insert(schema.groupMembers)
        .values({ groupId: group.id, userId, role: "owner" });
      return { userId, email, name };
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
    if (!user) throw new Error("User row missing after ON CONFLICT");
    return { userId: user.id, email: user.email, name: user.name };
  });
}
