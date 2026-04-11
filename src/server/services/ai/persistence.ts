import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { signalRationales } from '@/server/db/schema';
import type { Rationale } from './types';

const toStr = (n: number | null): string | null => (n === null ? null : String(n));

export async function upsertRationale(signalId: number, rationale: Rationale): Promise<void> {
  await db
    .insert(signalRationales)
    .values({
      signalId,
      summary: rationale.summary,
      fundamentalThesis: rationale.fundamentalThesis,
      technicalContext: rationale.technicalContext,
      targetPrice: toStr(rationale.targetPrice),
      stopLoss: toStr(rationale.stopLoss),
      riskReward: toStr(rationale.riskReward),
      confidence: rationale.confidence,
      strategyNote: rationale.strategyNote,
      disclaimer: rationale.disclaimer,
    })
    .onConflictDoUpdate({
      target: signalRationales.signalId,
      set: {
        summary: sql`excluded.summary`,
        fundamentalThesis: sql`excluded.fundamental_thesis`,
        technicalContext: sql`excluded.technical_context`,
        targetPrice: sql`excluded.target_price`,
        stopLoss: sql`excluded.stop_loss`,
        riskReward: sql`excluded.risk_reward`,
        confidence: sql`excluded.confidence`,
        strategyNote: sql`excluded.strategy_note`,
        disclaimer: sql`excluded.disclaimer`,
        updatedAt: sql`now()`,
      },
    });
}
