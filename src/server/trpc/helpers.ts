import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';

/**
 * Looks up the internal user row for a given Clerk user ID, creating one if it
 * doesn't exist yet.  Returns the internal numeric primary key.
 */
export async function getOrCreateUser(clerkUserId: string): Promise<number> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing) return existing.id;
  const [inserted] = await db.insert(users).values({ clerkUserId }).returning({ id: users.id });
  return inserted.id;
}
