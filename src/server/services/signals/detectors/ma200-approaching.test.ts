import { describe, it, expect } from 'vitest';
import { detectMa200Approaching } from './ma200-approaching';
import type { PriceBar } from '../types';

function mkBar(close: number, ma200: number, slope: number, i: number): PriceBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    close,
    volume: 1_000_000,
    ma150: null,
    ma200,
    ma150Slope: null,
    ma200Slope: slope,
  };
}

describe('detectMa200Approaching (SIG-01)', () => {
  it('triggers when close within 2% below MA200 and slope > 0', () => {
    const bars = [mkBar(98, 100, 0.5, 0), mkBar(99, 100, 0.5, 1)];
    const result = detectMa200Approaching(bars);
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SIG-01');
    expect(result!.strength).toBe('medium');
  });

  it('does not trigger when close is above MA200', () => {
    const bars = [mkBar(101, 100, 0.5, 0)];
    expect(detectMa200Approaching(bars)).toBeNull();
  });

  it('does not trigger when close is > 2% below MA200', () => {
    const bars = [mkBar(97, 100, 0.5, 0)];
    expect(detectMa200Approaching(bars)).toBeNull();
  });

  it('does not trigger when slope ≤ 0', () => {
    const bars = [mkBar(99, 100, 0, 0)];
    expect(detectMa200Approaching(bars)).toBeNull();
  });

  it('returns null when ma200 is missing', () => {
    const bars: PriceBar[] = [
      {
        date: '2026-03-01',
        close: 99,
        volume: 1,
        ma150: null,
        ma200: null,
        ma150Slope: null,
        ma200Slope: null,
      },
    ];
    expect(detectMa200Approaching(bars)).toBeNull();
  });

  it('returns null for empty bars', () => {
    expect(detectMa200Approaching([])).toBeNull();
  });
});
