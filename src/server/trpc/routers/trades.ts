// @vitest-environment node
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { db } from '@/server/db';
import { stocks, userTrades } from '@/server/db/schema';
import { getOrCreateUser } from '../helpers';

export const tradesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const internalId = await getOrCreateUser(ctx.userId);
    const rows = await db
      .select({
        tradeId: userTrades.id,
        stockId: userTrades.stockId,
        ticker: stocks.ticker,
        name: stocks.name,
        entryPrice: userTrades.entryPrice,
        entryDate: userTrades.entryDate,
        shares: userTrades.shares,
        exitPrice: userTrades.exitPrice,
        exitDate: userTrades.exitDate,
        realizedPnl: userTrades.realizedPnl,
        notes: userTrades.notes,
        createdAt: userTrades.createdAt,
      })
      .from(userTrades)
      .innerJoin(stocks, eq(stocks.id, userTrades.stockId))
      .where(eq(userTrades.userId, internalId))
      .orderBy(desc(userTrades.createdAt));

    return rows.map((r) => ({
      tradeId: r.tradeId,
      stockId: r.stockId,
      ticker: r.ticker,
      name: r.name,
      entryPrice: Number(r.entryPrice),
      entryDate: r.entryDate,
      shares: Number(r.shares),
      exitPrice: r.exitPrice !== null ? Number(r.exitPrice) : null,
      exitDate: r.exitDate ?? null,
      realizedPnl: r.realizedPnl !== null ? Number(r.realizedPnl) : null,
      notes: r.notes,
      createdAt: r.createdAt,
      status: (r.exitPrice !== null ? 'CLOSED' : 'OPEN') as 'OPEN' | 'CLOSED',
    }));
  }),

  add: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(10),
        entryPrice: z.number().positive(),
        entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        shares: z.number().positive(),
        notes: z.string().max(500).optional(),
      }),
    )
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
      const internalId = await getOrCreateUser(ctx.userId);
      const [inserted] = await db
        .insert(userTrades)
        .values({
          userId: internalId,
          stockId: stock.id,
          entryPrice: String(input.entryPrice),
          entryDate: input.entryDate,
          shares: String(input.shares),
          notes: input.notes ?? null,
        })
        .returning({ id: userTrades.id });
      return { success: true, tradeId: inserted.id };
    }),

  close: protectedProcedure
    .input(
      z.object({
        tradeId: z.number().int(),
        exitPrice: z.number().positive(),
        exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const internalId = await getOrCreateUser(ctx.userId);
      const [trade] = await db
        .select({
          id: userTrades.id,
          userId: userTrades.userId,
          entryPrice: userTrades.entryPrice,
          shares: userTrades.shares,
        })
        .from(userTrades)
        .where(and(eq(userTrades.id, input.tradeId), eq(userTrades.userId, internalId)))
        .limit(1);
      if (!trade) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Trade not found' });
      }
      const realizedPnl = (input.exitPrice - Number(trade.entryPrice)) * Number(trade.shares);
      await db
        .update(userTrades)
        .set({
          exitPrice: String(input.exitPrice),
          exitDate: input.exitDate,
          realizedPnl: String(realizedPnl),
        })
        .where(eq(userTrades.id, input.tradeId));
      return { success: true, realizedPnl };
    }),

  remove: protectedProcedure
    .input(z.object({ tradeId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const internalId = await getOrCreateUser(ctx.userId);
      await db
        .delete(userTrades)
        .where(and(eq(userTrades.id, input.tradeId), eq(userTrades.userId, internalId)));
      return { success: true };
    }),
});
