import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export interface SignalJoinRow {
  signalId: number;
  signalType: string;
  strength: string;
  volumeConfirmed: boolean;
  fundamentalScore: string | null;
  signalScore: string | null;
  triggeredAt: Date;
  stockId: number;
  ticker: string;
  name: string;
  sector: string | null;
  lastPrice: string | null;
  recState: string | null;
  recTargetPrice: string | null;
  recStopLoss: string | null;
  recTrailingStop: string | null;
  recTransitionedAt: Date | null;
  rationaleSummary: string | null;
  rationaleConfidence: string | null;
}

export interface SignalViewModel {
  signalId: number;
  signalType: string;
  strength: string;
  volumeConfirmed: boolean;
  fundamentalScore: number | null;
  signalScore: number | null;
  triggeredAt: Date;
  stock: {
    id: number;
    ticker: string;
    name: string;
    sector: string | null;
    lastPrice: number | null;
  };
  recommendation: {
    state: string;
    targetPrice: number | null;
    stopLoss: number | null;
    trailingStop: number | null;
    transitionedAt: Date;
  } | null;
  rationale: {
    summary: string;
    confidence: string | null;
  } | null;
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function transformSignalRow(row: SignalJoinRow): SignalViewModel {
  return {
    signalId: row.signalId,
    signalType: row.signalType,
    strength: row.strength,
    volumeConfirmed: row.volumeConfirmed,
    fundamentalScore: toNumber(row.fundamentalScore),
    signalScore: toNumber(row.signalScore),
    triggeredAt: row.triggeredAt,
    stock: {
      id: row.stockId,
      ticker: row.ticker,
      name: row.name,
      sector: row.sector,
      lastPrice: toNumber(row.lastPrice),
    },
    recommendation:
      row.recState && row.recTransitionedAt
        ? {
            state: row.recState,
            targetPrice: toNumber(row.recTargetPrice),
            stopLoss: toNumber(row.recStopLoss),
            trailingStop: toNumber(row.recTrailingStop),
            transitionedAt: row.recTransitionedAt,
          }
        : null,
    rationale:
      row.rationaleSummary !== null
        ? {
            summary: row.rationaleSummary,
            confidence: row.rationaleConfidence,
          }
        : null,
  };
}

const TERMINAL = ['SELL', 'STOP_HIT', 'EXPIRED'] as const;

export const signalsRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { db } = await import('@/server/db');
      const { desc, eq, isNull, notInArray, or } = await import('drizzle-orm');
      const { signals, signalRecommendations, signalRationales, stocks } = await import(
        '@/server/db/schema'
      );

      const limit = input?.limit ?? 20;

      const signalSelect = {
        signalId: signals.id,
        signalType: signals.signalType,
        strength: signals.strength,
        volumeConfirmed: signals.volumeConfirmed,
        fundamentalScore: signals.fundamentalScore,
        signalScore: signals.signalScore,
        triggeredAt: signals.triggeredAt,
        stockId: stocks.id,
        ticker: stocks.ticker,
        name: stocks.name,
        sector: stocks.sector,
        lastPrice: stocks.price,
        recState: signalRecommendations.state,
        recTargetPrice: signalRecommendations.targetPrice,
        recStopLoss: signalRecommendations.stopLoss,
        recTrailingStop: signalRecommendations.trailingStop,
        recTransitionedAt: signalRecommendations.transitionedAt,
        rationaleSummary: signalRationales.summary,
        rationaleConfidence: signalRationales.confidence,
      } as const;

      const rows = await db
        .select(signalSelect)
        .from(signals)
        .innerJoin(stocks, eq(stocks.id, signals.stockId))
        .leftJoin(
          signalRecommendations,
          eq(signalRecommendations.signalId, signals.id),
        )
        .leftJoin(signalRationales, eq(signalRationales.signalId, signals.id))
        .where(
          or(
            isNull(signalRecommendations.id),
            notInArray(signalRecommendations.state, [...TERMINAL] as unknown as ('SELL' | 'STOP_HIT' | 'EXPIRED')[]),
          ),
        )
        .orderBy(desc(signals.triggeredAt))
        .limit(limit);

      return rows.map((r) => transformSignalRow(r as SignalJoinRow));
    }),

  byTicker: publicProcedure
    .input(z.object({ ticker: z.string().min(1).max(10) }))
    .query(async ({ input }) => {
      const { db } = await import('@/server/db');
      const { desc, eq } = await import('drizzle-orm');
      const { signals, signalRecommendations, signalRationales, stocks } = await import(
        '@/server/db/schema'
      );

      const signalSelect = {
        signalId: signals.id,
        signalType: signals.signalType,
        strength: signals.strength,
        volumeConfirmed: signals.volumeConfirmed,
        fundamentalScore: signals.fundamentalScore,
        signalScore: signals.signalScore,
        triggeredAt: signals.triggeredAt,
        stockId: stocks.id,
        ticker: stocks.ticker,
        name: stocks.name,
        sector: stocks.sector,
        lastPrice: stocks.price,
        recState: signalRecommendations.state,
        recTargetPrice: signalRecommendations.targetPrice,
        recStopLoss: signalRecommendations.stopLoss,
        recTrailingStop: signalRecommendations.trailingStop,
        recTransitionedAt: signalRecommendations.transitionedAt,
        rationaleSummary: signalRationales.summary,
        rationaleConfidence: signalRationales.confidence,
      } as const;

      const ticker = input.ticker.toUpperCase();
      const rows = await db
        .select(signalSelect)
        .from(signals)
        .innerJoin(stocks, eq(stocks.id, signals.stockId))
        .leftJoin(
          signalRecommendations,
          eq(signalRecommendations.signalId, signals.id),
        )
        .leftJoin(signalRationales, eq(signalRationales.signalId, signals.id))
        .where(eq(stocks.ticker, ticker))
        .orderBy(desc(signals.triggeredAt));

      const vms = rows.map((r) => transformSignalRow(r as SignalJoinRow));
      if (vms.length === 0) return null;
      return {
        stock: vms[0].stock,
        signals: vms,
      };
    }),
});
