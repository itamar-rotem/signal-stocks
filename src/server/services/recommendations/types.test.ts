import { describe, it, expect } from 'vitest';
import type { RecommendationState, EvaluationContext, Decision } from './types';

describe('recommendation types', () => {
  it('RecommendationState union', () => {
    const s: RecommendationState = 'HOLD';
    expect(s).toBe('HOLD');
  });

  it('Decision no-change', () => {
    const d: Decision = { kind: 'no_change' };
    expect(d.kind).toBe('no_change');
  });

  it('Decision transition', () => {
    const d: Decision = {
      kind: 'transition',
      to: 'SELL',
      reason: 'Target reached',
      newTarget: null,
      newStopLoss: null,
      newTrailingStop: null,
    };
    expect(d.to).toBe('SELL');
  });

  it('EvaluationContext shape', () => {
    const ctx: EvaluationContext = {
      entryPrice: 100,
      currentPrice: 110,
      targetPrice: 120,
      stopLoss: 95,
      trailingStop: null,
      highestCloseSinceEntry: 112,
      atr14: 2.5,
      daysSinceEntry: 5,
      daysInState: 2,
      volumeConfirmed: true,
      fundamentalScore: 75,
      signalStrength: 'strong',
      brokenMa: 150,
      currentMa150: 148,
      currentMa200: 140,
    };
    expect(ctx.currentPrice).toBe(110);
  });
});
