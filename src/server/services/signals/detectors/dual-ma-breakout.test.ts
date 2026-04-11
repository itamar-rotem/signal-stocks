import { describe, it, expect } from 'vitest';
import { detectDualMaBreakout } from './dual-ma-breakout';
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

describe('detectDualMaBreakout (SIG-05)', () => {
  it('triggers when both MAs broken within 5-day window', () => {
    // 10 bars below both MAs, then day 10 breaks MA150, day 12 breaks MA200
    const bars: PriceBar[] = [];
    for (let i = 0; i < 10; i++) bars.push(mkBar(90, 100, 105, i));
    bars.push(mkBar(101, 100, 105, 10)); // broke MA150
    bars.push(mkBar(102, 100, 105, 11)); // still below MA200
    bars.push(mkBar(106, 100, 105, 12)); // broke MA200 — within 5-day window, must be last bar

    const result = detectDualMaBreakout(bars);
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SIG-05');
    expect(result!.strength).toBe('very_strong');
  });

  it('does not trigger when MAs broken > 5 days apart', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 10; i++) bars.push(mkBar(90, 100, 105, i));
    bars.push(mkBar(101, 100, 105, 10)); // broke MA150
    // 6 bars between
    for (let i = 11; i < 17; i++) bars.push(mkBar(101, 100, 105, i));
    bars.push(mkBar(106, 100, 105, 17)); // broke MA200 — 7 days later
    expect(detectDualMaBreakout(bars)).toBeNull();
  });

  it('does not trigger when one MA never breaks', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 14; i++) bars.push(mkBar(101, 100, 105, i));
    expect(detectDualMaBreakout(bars)).toBeNull();
  });

  it('returns null when MAs are missing', () => {
    const bars: PriceBar[] = Array.from({ length: 14 }, (_, i) => mkBar(100, null, null, i));
    expect(detectDualMaBreakout(bars)).toBeNull();
  });
});
