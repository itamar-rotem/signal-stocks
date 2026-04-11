import { describe, it, expect } from 'vitest';
import { detectGoldenCross } from './golden-cross';
import type { PriceBar } from '../types';

function mkBar(close: number, ma150: number | null, ma200: number | null, i: number): PriceBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    close,
    volume: 1_000_000,
    ma150,
    ma200,
    ma150Slope: null,
    ma200Slope: null,
  };
}

describe('detectGoldenCross (SIG-06)', () => {
  it('triggers when MA150 crosses above MA200 and close above both', () => {
    const bars = [
      mkBar(110, 99, 100, 0),
      mkBar(111, 101, 100, 1), // MA150 crosses above MA200
    ];
    const result = detectGoldenCross(bars);
    expect(result).not.toBeNull();
    expect(result!.strength).toBe('very_strong');
  });

  it('does not trigger when price is below one of the MAs', () => {
    const bars = [mkBar(99, 99, 100, 0), mkBar(99, 101, 100, 1)];
    expect(detectGoldenCross(bars)).toBeNull();
  });

  it('does not trigger without a crossing', () => {
    const bars = [mkBar(110, 101, 100, 0), mkBar(110, 102, 100, 1)];
    expect(detectGoldenCross(bars)).toBeNull();
  });

  it('returns null with insufficient bars', () => {
    expect(detectGoldenCross([mkBar(110, 101, 100, 0)])).toBeNull();
  });
});
