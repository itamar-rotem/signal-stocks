import { describe, it, expect } from 'vitest';
import { percentileRank, scoreToPercentile } from './percentile';

describe('percentileRank', () => {
  it('returns 100 for the maximum value', () => {
    expect(percentileRank(10, [1, 2, 5, 10])).toBe(100);
  });

  it('returns 0 for the minimum value', () => {
    expect(percentileRank(1, [1, 2, 5, 10])).toBe(0);
  });

  it('handles single-element peer list', () => {
    expect(percentileRank(5, [5])).toBe(50);
  });

  it('handles empty peer list', () => {
    expect(percentileRank(5, [])).toBe(50);
  });

  it('handles null target value', () => {
    expect(percentileRank(null, [1, 2, 3])).toBeNull();
  });

  it('ignores null peers', () => {
    expect(percentileRank(5, [1, null, 10, null])).toBe(50);
  });

  it('ties are handled mid-rank', () => {
    // value=5, peers=[1,5,5,10] → 5 is median → 50
    expect(percentileRank(5, [1, 5, 5, 10])).toBeCloseTo(50, 0);
  });

  it('handles all-null peer list', () => {
    expect(percentileRank(5, [null, null, null])).toBe(50);
  });

  it('inverts when lowerIsBetter is true (valuation metrics)', () => {
    // Low P/E is better — a P/E of 1 in [1,2,5,10] should score 100, not 0
    expect(percentileRank(1, [1, 2, 5, 10], { lowerIsBetter: true })).toBe(100);
    expect(percentileRank(10, [1, 2, 5, 10], { lowerIsBetter: true })).toBe(0);
  });
});

describe('scoreToPercentile', () => {
  it('clamps negative inputs to 0', () => {
    expect(scoreToPercentile(-10)).toBe(0);
  });

  it('clamps above 100 to 100', () => {
    expect(scoreToPercentile(150)).toBe(100);
  });

  it('passes through valid values', () => {
    expect(scoreToPercentile(50)).toBe(50);
  });

  it('passes through null', () => {
    expect(scoreToPercentile(null)).toBeNull();
  });
});
