import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  signalRecommendations,
  signalStateLog,
  signalOutcomes,
} from '@/server/db/schema';
import type { RecommendationState, Decision } from './types';
import { TERMINAL_STATES } from './types';

const toStr = (n: number | null): string | null =>
  n === null ? null : String(n);

export async function upsertRecommendation(params: {
  signalId: number;
  state: RecommendationState;
  previousState: RecommendationState | null;
  targetPrice: number | null;
  stopLoss: number | null;
  trailingStop: number | null;
}): Promise<void> {
  const { signalId, state, previousState, targetPrice, stopLoss, trailingStop } =
    params;
  await db
    .insert(signalRecommendations)
    .values({
      signalId,
      state,
      previousState: previousState ?? null,
      targetPrice: toStr(targetPrice),
      stopLoss: toStr(stopLoss),
      trailingStop: toStr(trailingStop),
    })
    .onConflictDoUpdate({
      target: signalRecommendations.signalId,
      set: {
        state: sql`excluded.state`,
        previousState: sql`excluded.previous_state`,
        targetPrice: sql`excluded.target_price`,
        stopLoss: sql`excluded.stop_loss`,
        trailingStop: sql`excluded.trailing_stop`,
        transitionedAt: sql`now()`,
      },
    });
}

export async function appendStateLog(params: {
  signalId: number;
  fromState: RecommendationState | null;
  toState: RecommendationState;
  reason: string;
}): Promise<void> {
  await db.insert(signalStateLog).values({
    signalId: params.signalId,
    fromState: params.fromState ?? null,
    toState: params.toState,
    reason: params.reason,
  });
}

export async function writeOutcomeIfTerminal(params: {
  signalId: number;
  decision: Decision;
  entryPrice: number;
  exitPrice: number;
  daysHeld: number;
}): Promise<void> {
  if (params.decision.kind !== 'transition') return;
  if (!TERMINAL_STATES.has(params.decision.to)) return;

  const outcome =
    params.decision.to === 'SELL'
      ? 'target_hit'
      : params.decision.to === 'STOP_HIT'
        ? 'stopped_out'
        : 'expired';

  const actualReturnPct =
    ((params.exitPrice - params.entryPrice) / params.entryPrice) * 100;

  await db
    .insert(signalOutcomes)
    .values({
      signalId: params.signalId,
      outcome,
      entryPrice: String(params.entryPrice),
      exitPrice: String(params.exitPrice),
      actualReturnPct: String(actualReturnPct),
      daysHeld: params.daysHeld,
    })
    .onConflictDoNothing({ target: signalOutcomes.signalId });
}
