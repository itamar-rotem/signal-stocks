import { describe, it, expect } from 'vitest';
import { computeSMA, computeSlope } from './moving-averages';

describe('computeSMA', () => {
  it('returns null for positions before the window is full', () => {
    const closes = [10, 11, 12, 13, 14];
    const result = computeSMA(closes, 3);
    expect(result).toEqual([null, null, 11, 12, 13]);
  });

  it('computes a simple 3-period average', () => {
    const closes = [1, 2, 3, 4, 5, 6];
    const result = computeSMA(closes, 3);
    expect(result).toEqual([null, null, 2, 3, 4, 5]);
  });

  it('handles window size equal to series length', () => {
    const closes = [10, 20, 30];
    const result = computeSMA(closes, 3);
    expect(result).toEqual([null, null, 20]);
  });

  it('returns all nulls if series is shorter than window', () => {
    const closes = [10, 20];
    const result = computeSMA(closes, 3);
    expect(result).toEqual([null, null]);
  });

  it('returns empty array on empty input', () => {
    expect(computeSMA([], 5)).toEqual([]);
  });

  it('throws on non-positive window', () => {
    expect(() => computeSMA([1, 2, 3], 0)).toThrow();
    expect(() => computeSMA([1, 2, 3], -1)).toThrow();
  });

  it('preserves precision — no floating drift over 200 values', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i * 0.1);
    const result = computeSMA(closes, 200);
    expect(result[199]).toBeCloseTo(109.95, 2);
    expect(result[249]).toBeCloseTo(114.95, 2);
  });
});

describe('computeSlope', () => {
  it('returns null for positions before the lookback is available', () => {
    const series = [100, 101, 102, 103, 104];
    const result = computeSlope(series, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
  });

  it('returns positive slope for ascending series', () => {
    const series = [100, 101, 102, 103, 104, 105];
    const result = computeSlope(series, 5);
    expect(result[5]).toBeGreaterThan(0);
  });

  it('returns negative slope for descending series', () => {
    const series = [105, 104, 103, 102, 101, 100];
    const result = computeSlope(series, 5);
    expect(result[5]).toBeLessThan(0);
  });

  it('returns zero slope for flat series', () => {
    const series = [100, 100, 100, 100, 100, 100];
    const result = computeSlope(series, 5);
    expect(result[5]).toBe(0);
  });

  it('propagates nulls in the input series', () => {
    const series: (number | null)[] = [null, null, 100, 101, 102, 103];
    const result = computeSlope(series, 3);
    // position 5 looks back to position 2 (100), ok
    expect(result[5]).toBeCloseTo((103 - 100) / 3, 6);
    // position 2 looks back to position -1, null
    expect(result[2]).toBeNull();
  });

  it('returns null when lookback value is null', () => {
    const series: (number | null)[] = [100, null, 102, 103, 104, 105];
    const result = computeSlope(series, 4);
    // position 4 looks back to position 0 (100), ok
    expect(result[4]).toBeCloseTo((104 - 100) / 4, 6);
    // position 5 looks back to position 1 (null)
    expect(result[5]).toBeNull();
  });

  it('throws on non-positive lookback', () => {
    expect(() => computeSlope([1, 2, 3], 0)).toThrow();
  });
});
