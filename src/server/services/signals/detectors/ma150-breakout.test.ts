import { describe, it, expect } from 'vitest';
import { detectMa150Breakout } from './ma150-breakout';
import type { PriceBar } from '../types';

function mkBar(close: number, i: number): PriceBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    close,
    volume: 1_000_000,
    ma150: 100, // fixed MA150
    ma200: null,
    ma150Slope: null,
    ma200Slope: null,
  };
}

describe('detectMa150Breakout (SIG-04)', () => {
  it('triggers when 2 bars above after ≥10 below', () => {
    const below = Array.from({ length: 12 }, (_, i) => mkBar(95, i));
    const above = [mkBar(105, 12), mkBar(106, 13)];
    const result = detectMa150Breakout([...below, ...above]);
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SIG-04');
    expect(result!.strength).toBe('strong');
    expect(result!.triggeredAt).toBe(above[1].date);
  });

  it('does not trigger when only last bar is above', () => {
    const below = Array.from({ length: 12 }, (_, i) => mkBar(95, i));
    const mixed = [mkBar(95, 12), mkBar(105, 13)];
    expect(detectMa150Breakout([...below, ...mixed])).toBeNull();
  });

  it('does not trigger without enough prior below-bars', () => {
    const short = [mkBar(95, 0), mkBar(95, 1), mkBar(95, 2), mkBar(105, 3), mkBar(106, 4)];
    expect(detectMa150Breakout(short)).toBeNull();
  });

  it('returns null when MA150 is missing on latest bars', () => {
    const bars: PriceBar[] = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      close: 100,
      volume: 1,
      ma150: null,
      ma200: null,
      ma150Slope: null,
      ma200Slope: null,
    }));
    expect(detectMa150Breakout(bars)).toBeNull();
  });
});
