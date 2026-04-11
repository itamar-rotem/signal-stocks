import { describe, it, expect } from 'vitest';
import { initialTarget, initialStopLoss } from './targets';

describe('initialTarget', () => {
  it('returns entry × (1 + score/100 × 0.20) for a valid score', () => {
    expect(initialTarget(100, 80)).toBeCloseTo(116, 4);
    expect(initialTarget(100, 60)).toBeCloseTo(112, 4);
    expect(initialTarget(100, 100)).toBeCloseTo(120, 4);
  });

  it('returns null when score is null', () => {
    expect(initialTarget(100, null)).toBeNull();
  });

  it('clamps minimum upside at 5% even for very low scores', () => {
    expect(initialTarget(100, 20)).toBeCloseTo(105, 4);
  });
});

describe('initialStopLoss', () => {
  it('ma200 breakout: 4% below MA200, capped at 10% below entry', () => {
    expect(initialStopLoss(100, 200, 95)).toBeCloseTo(95 * 0.96, 4);
  });

  it('ma150 breakout: 4% below MA150', () => {
    expect(initialStopLoss(100, 150, 98)).toBeCloseTo(98 * 0.96, 4);
  });

  it('caps at 10% below entry (never more aggressive than 90% of entry)', () => {
    expect(initialStopLoss(100, 200, 85)).toBeCloseTo(90, 4);
  });

  it('returns null when MA is null', () => {
    expect(initialStopLoss(100, 200, null)).toBeNull();
  });
});
