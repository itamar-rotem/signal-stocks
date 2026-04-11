import { describe, it, expect } from 'vitest';
import { evaluateTransition } from './state-machine';
import type { EvaluationContext } from './types';

const baseCtx: EvaluationContext = {
  entryPrice: 100,
  currentPrice: 105,
  targetPrice: 120,
  stopLoss: 95,
  trailingStop: null,
  highestCloseSinceEntry: 105,
  atr14: 2,
  daysSinceEntry: 1,
  daysInState: 1,
  volumeConfirmed: true,
  fundamentalScore: 75,
  signalStrength: 'strong',
  brokenMa: 200,
  currentMa150: 98,
  currentMa200: 96,
};

describe('evaluateTransition', () => {
  describe('WATCH', () => {
    it('transitions to BUY when volume confirms with strong strength', () => {
      const d = evaluateTransition('WATCH', baseCtx);
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('BUY');
    });

    it('expires after 30 days', () => {
      const d = evaluateTransition('WATCH', {
        ...baseCtx,
        daysInState: 31,
        volumeConfirmed: false,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('EXPIRED');
    });

    it('stays in WATCH otherwise', () => {
      const d = evaluateTransition('WATCH', {
        ...baseCtx,
        volumeConfirmed: false,
        daysInState: 5,
      });
      expect(d.kind).toBe('no_change');
    });
  });

  describe('BUY', () => {
    it('transitions to HOLD after a day', () => {
      const d = evaluateTransition('BUY', { ...baseCtx, daysInState: 1 });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('HOLD');
    });
  });

  describe('HOLD', () => {
    it('transitions to SELL when price reaches target', () => {
      const d = evaluateTransition('HOLD', { ...baseCtx, currentPrice: 121 });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('SELL');
    });

    it('transitions to STOP_HIT when price falls to stop', () => {
      const d = evaluateTransition('HOLD', { ...baseCtx, currentPrice: 94 });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('STOP_HIT');
    });

    it('transitions to TAKE_PARTIAL_PROFIT at 50% of upside', () => {
      const d = evaluateTransition('HOLD', { ...baseCtx, currentPrice: 111 });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('TAKE_PARTIAL_PROFIT');
    });

    it('transitions to DOWNGRADED when fundamental score drops', () => {
      const d = evaluateTransition('HOLD', {
        ...baseCtx,
        fundamentalScore: 45,
        currentPrice: 105,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('DOWNGRADED');
    });

    it('transitions to DOWNGRADED when price falls back below broken MA200', () => {
      const d = evaluateTransition('HOLD', {
        ...baseCtx,
        currentPrice: 95.5,
        stopLoss: 90,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('DOWNGRADED');
    });

    it('stays in HOLD otherwise', () => {
      const d = evaluateTransition('HOLD', baseCtx);
      expect(d.kind).toBe('no_change');
    });
  });

  describe('TAKE_PARTIAL_PROFIT', () => {
    it('transitions to SELL when price reaches target', () => {
      const d = evaluateTransition('TAKE_PARTIAL_PROFIT', {
        ...baseCtx,
        currentPrice: 120,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('SELL');
    });

    it('transitions to STOP_HIT when price falls to trailing stop', () => {
      const d = evaluateTransition('TAKE_PARTIAL_PROFIT', {
        ...baseCtx,
        currentPrice: 104,
        trailingStop: 105,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('STOP_HIT');
    });
  });

  describe('DOWNGRADED', () => {
    it('transitions to STOP_HIT on continued fall', () => {
      const d = evaluateTransition('DOWNGRADED', {
        ...baseCtx,
        currentPrice: 90,
        stopLoss: 92,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('STOP_HIT');
    });

    it('recovers to HOLD when fundamentals ≥ 60 and price reclaims MA', () => {
      const d = evaluateTransition('DOWNGRADED', {
        ...baseCtx,
        currentPrice: 105,
        fundamentalScore: 70,
        currentMa200: 100,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('HOLD');
    });
  });

  describe('terminal states', () => {
    it('SELL is terminal', () => {
      expect(evaluateTransition('SELL', baseCtx).kind).toBe('no_change');
    });
    it('STOP_HIT is terminal', () => {
      expect(evaluateTransition('STOP_HIT', baseCtx).kind).toBe('no_change');
    });
    it('EXPIRED is terminal', () => {
      expect(evaluateTransition('EXPIRED', baseCtx).kind).toBe('no_change');
    });
  });
});
