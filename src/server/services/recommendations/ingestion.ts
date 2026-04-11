import { desc, eq, isNull, notInArray, or } from 'drizzle-orm';
import { db } from '@/server/db';
import { signals, signalRecommendations, fundamentals, dailyPrices } from '@/server/db/schema';
import { deriveInitialState } from './initial-state';
import { initialTarget, initialStopLoss } from './targets';
import { compute14DayATR } from './atr';
import { computeTrailingStop } from './trailing-stop';
import { evaluateTransition } from './state-machine';
import { upsertRecommendation, appendStateLog, writeOutcomeIfTerminal } from './persistence';
import type { EvaluationContext, RecommendationState } from './types';

export interface EvaluationSummary {
  processed: number;
  created: number;
  transitions: number;
  unchanged: number;
  errors: { signalId: number; error: string }[];
}

const TERMINAL: RecommendationState[] = ['SELL', 'STOP_HIT', 'EXPIRED'];

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function evaluateAllActiveSignals(): Promise<EvaluationSummary> {
  const summary: EvaluationSummary = {
    processed: 0,
    created: 0,
    transitions: 0,
    unchanged: 0,
    errors: [],
  };

  const rows = await db
    .select({
      signalId: signals.id,
      stockId: signals.stockId,
      signalType: signals.signalType,
      strength: signals.strength,
      volumeConfirmed: signals.volumeConfirmed,
      signalScore: signals.signalScore,
      triggeredAt: signals.triggeredAt,
      recState: signalRecommendations.state,
      recTarget: signalRecommendations.targetPrice,
      recStop: signalRecommendations.stopLoss,
      recTrailing: signalRecommendations.trailingStop,
      recTransitionedAt: signalRecommendations.transitionedAt,
      recId: signalRecommendations.id,
    })
    .from(signals)
    .leftJoin(signalRecommendations, eq(signalRecommendations.signalId, signals.id))
    .where(or(isNull(signalRecommendations.id), notInArray(signalRecommendations.state, TERMINAL)));

  for (const row of rows) {
    summary.processed++;
    try {
      const [fund] = await db
        .select({ fundamentalScore: fundamentals.fundamentalScore })
        .from(fundamentals)
        .where(eq(fundamentals.stockId, row.stockId))
        .orderBy(desc(fundamentals.quarter))
        .limit(1);
      const fundamentalScore = fund ? toNumber(fund.fundamentalScore) : null;

      const priceRows = await db
        .select({
          date: dailyPrices.date,
          high: dailyPrices.high,
          low: dailyPrices.low,
          close: dailyPrices.close,
          ma150: dailyPrices.ma150,
          ma200: dailyPrices.ma200,
        })
        .from(dailyPrices)
        .where(eq(dailyPrices.stockId, row.stockId))
        .orderBy(desc(dailyPrices.date))
        .limit(60);

      if (priceRows.length === 0) {
        summary.errors.push({
          signalId: row.signalId,
          error: 'no price history',
        });
        continue;
      }

      const bars = priceRows.slice().reverse();
      const currentBar = bars[bars.length - 1];
      const currentPrice = Number(currentBar.close);
      const currentMa150 = toNumber(currentBar.ma150);
      const currentMa200 = toNumber(currentBar.ma200);

      const atrBars = bars.map((b) => ({
        date: b.date,
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
      }));
      const atr14 = compute14DayATR(atrBars);

      const brokenMa: 150 | 200 | null =
        row.signalType === 'SIG-04'
          ? 150
          : row.signalType === 'SIG-02' ||
              row.signalType === 'SIG-05' ||
              row.signalType === 'SIG-06'
            ? 200
            : null;

      const triggeredDate = new Date(row.triggeredAt).toISOString().slice(0, 10);
      const entryBarIdx = bars.findIndex((b) => b.date >= triggeredDate);
      const entryPrice = entryBarIdx >= 0 ? Number(bars[entryBarIdx].close) : currentPrice;

      const highestCloseSinceEntry = bars
        .slice(entryBarIdx >= 0 ? entryBarIdx : 0)
        .reduce((max, b) => Math.max(max, Number(b.close)), entryPrice);

      const daysSinceEntry = Math.max(
        0,
        Math.round(
          (new Date(currentBar.date).getTime() - new Date(triggeredDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );

      const daysInState = row.recTransitionedAt
        ? Math.max(
            0,
            Math.round(
              (new Date(currentBar.date).getTime() - new Date(row.recTransitionedAt).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : daysSinceEntry;

      // New signal — no recommendation row exists yet
      if (!row.recState) {
        const initial = deriveInitialState(row.strength, row.volumeConfirmed);
        const tgt = initialTarget(entryPrice, toNumber(row.signalScore));
        const stop = initialStopLoss(
          entryPrice,
          brokenMa ?? 200,
          brokenMa === 150 ? currentMa150 : currentMa200,
        );
        await upsertRecommendation({
          signalId: row.signalId,
          state: initial,
          previousState: null,
          targetPrice: tgt,
          stopLoss: stop,
          trailingStop: null,
        });
        await appendStateLog({
          signalId: row.signalId,
          fromState: null,
          toState: initial,
          reason: 'Signal created',
        });
        summary.created++;
        continue;
      }

      const targetPrice = toNumber(row.recTarget);
      const stopLoss = toNumber(row.recStop);

      const trailingStop = computeTrailingStop({
        entryPrice,
        currentPrice,
        highestCloseSinceEntry,
        atr14,
        currentStopLoss: stopLoss,
      });

      const ctx: EvaluationContext = {
        entryPrice,
        currentPrice,
        targetPrice,
        stopLoss,
        trailingStop,
        highestCloseSinceEntry,
        atr14,
        daysSinceEntry,
        daysInState,
        volumeConfirmed: row.volumeConfirmed,
        fundamentalScore,
        signalStrength: row.strength as 'medium' | 'strong' | 'very_strong',
        brokenMa,
        currentMa150,
        currentMa200,
      };

      const decision = evaluateTransition(row.recState as RecommendationState, ctx);

      if (decision.kind === 'no_change') {
        if (trailingStop !== stopLoss) {
          await upsertRecommendation({
            signalId: row.signalId,
            state: row.recState as RecommendationState,
            previousState: row.recState as RecommendationState,
            targetPrice,
            stopLoss,
            trailingStop,
          });
        }
        summary.unchanged++;
        continue;
      }

      await upsertRecommendation({
        signalId: row.signalId,
        state: decision.to,
        previousState: row.recState as RecommendationState,
        targetPrice,
        stopLoss,
        trailingStop,
      });
      await appendStateLog({
        signalId: row.signalId,
        fromState: row.recState as RecommendationState,
        toState: decision.to,
        reason: decision.reason,
      });
      await writeOutcomeIfTerminal({
        signalId: row.signalId,
        decision,
        entryPrice,
        exitPrice: currentPrice,
        daysHeld: daysSinceEntry,
      });
      summary.transitions++;
    } catch (err) {
      summary.errors.push({
        signalId: row.signalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
