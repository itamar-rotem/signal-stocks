import { describe, it, expect } from 'vitest';
import { detectSupportBounce } from './support-bounce';
import type { PriceBar } from '../types';

function mkBar(close: number, ma150: number, ma200: number, i: number): PriceBar {
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

describe('detectSupportBounce (SIG-07)', () => {
  it('triggers when price touches MA150 from above and bounces ≥1.5%', () => {
    // Bar -2: well above; Bar -1: touches MA150 at 100.5 (within 1%); Bar 0: bounces to 102.5
    const bars = [mkBar(110, 100, 90, 0), mkBar(100.5, 100, 90, 1), mkBar(102.5, 100, 90, 2)];
    const result = detectSupportBounce(bars);
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SIG-07');
    expect(result!.strength).toBe('strong');
  });

  it('does not trigger without a touch', () => {
    const bars = [mkBar(110, 100, 90, 0), mkBar(109, 100, 90, 1), mkBar(111, 100, 90, 2)];
    expect(detectSupportBounce(bars)).toBeNull();
  });

  it('does not trigger when bounce < 1.5%', () => {
    const bars = [
      mkBar(110, 100, 90, 0),
      mkBar(100.5, 100, 90, 1),
      mkBar(101.5, 100, 90, 2), // only ~1% bounce
    ];
    expect(detectSupportBounce(bars)).toBeNull();
  });

  it('returns null with insufficient bars', () => {
    expect(detectSupportBounce([mkBar(110, 100, 90, 0)])).toBeNull();
  });
});
