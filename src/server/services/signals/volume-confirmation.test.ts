import { describe, it, expect } from 'vitest';
import { computeAvgVolume, isVolumeConfirmed } from './volume-confirmation';
import type { PriceBar } from './types';

function bar(v: number, i = 0): PriceBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    close: 100,
    volume: v,
    ma150: null,
    ma200: null,
    ma150Slope: null,
    ma200Slope: null,
  };
}

describe('computeAvgVolume', () => {
  it('averages the last N bars excluding the current one', () => {
    const bars = Array.from({ length: 22 }, (_, i) => bar(1_000_000, i));
    // current = index 21; previous 20 bars = indices 1..20
    expect(computeAvgVolume(bars, 21, 20)).toBe(1_000_000);
  });

  it('returns null when history is insufficient', () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar(1_000_000, i));
    expect(computeAvgVolume(bars, 4, 20)).toBeNull();
  });

  it('does not include the current bar in the average', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 20; i++) bars.push(bar(1_000_000, i));
    bars.push(bar(9_999_999, 20)); // current bar
    expect(computeAvgVolume(bars, 20, 20)).toBe(1_000_000);
  });
});

describe('isVolumeConfirmed', () => {
  it('true when current volume >= 1.5x avg', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 20; i++) bars.push(bar(1_000_000, i));
    bars.push(bar(1_500_000, 20));
    expect(isVolumeConfirmed(bars, 20)).toBe(true);
  });

  it('false when current volume < 1.5x avg', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 20; i++) bars.push(bar(1_000_000, i));
    bars.push(bar(1_499_999, 20));
    expect(isVolumeConfirmed(bars, 20)).toBe(false);
  });

  it('false when insufficient history', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 5; i++) bars.push(bar(2_000_000, i));
    expect(isVolumeConfirmed(bars, 4)).toBe(false);
  });
});
