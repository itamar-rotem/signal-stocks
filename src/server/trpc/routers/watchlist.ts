import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { db } from '@/server/db';
import { users, watchlists, stocks } from '@/server/db/schema';

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

export const watchlistRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = await getOrCreateUser(ctx.userId);
    const rows = await db
      .select({
        watchlistId: watchlists.id,
        stockId: stocks.id,
        ticker: stocks.ticker,
        name: stocks.name,
        sector: stocks.sector,
        lastPrice: stocks.price,
        source: watchlists.source,
        addedAt: watchlists.addedAt,
      })
      .from(watchlists)
      .innerJoin(stocks, eq(stocks.id, watchlists.stockId))
      .where(eq(watchlists.userId, userId))
      .orderBy(desc(watchlists.addedAt));

    return rows.map((r) => ({
      ...r,
      lastPrice: r.lastPrice !== null ? Number(r.lastPrice) : null,
    }));
  }),

  add: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const ticker = input.ticker.toUpperCase();
      const [stock] = await db
        .select({ id: stocks.id })
        .from(stocks)
        .where(eq(stocks.ticker, ticker))
        .limit(1);
      if (!stock) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Stock ${ticker} not found` });
      }
      const userId = await getOrCreateUser(ctx.userId);
      await db
        .insert(watchlists)
        .values({ userId, stockId: stock.id, source: 'manual' })
        .onConflictDoNothing();
      return { success: true, ticker };
    }),

  remove: protectedProcedure
    .input(z.object({ stockId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const userId = await getOrCreateUser(ctx.userId);
      await db
        .delete(watchlists)
        .where(and(eq(watchlists.userId, userId), eq(watchlists.stockId, input.stockId)));
      return { success: true };
    }),
});
