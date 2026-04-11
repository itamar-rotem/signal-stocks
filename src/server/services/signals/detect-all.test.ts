import { describe, it, expect } from 'vitest';
import { detectAllSignals, downgradeStrength } from './detect-all';
import type { PriceBar } from './types';

function mkBar(close: number, i: number, overrides: Partial<PriceBar> = {}): PriceBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    close,
    volume: 1_000_000,
    ma150: null,
    ma200: 100,
    ma150Slope: null,
    ma200Slope: null,
    ...overrides,
  };
}

describe('downgradeStrength', () => {
  it('very_strong → strong', () => {
    expect(downgradeStrength('very_strong')).toBe('strong');
  });
  it('strong → medium', () => {
    expect(downgradeStrength('strong')).toBe('medium');
  });
  it('medium stays medium', () => {
    expect(downgradeStrength('medium')).toBe('medium');
  });
});

describe('detectAllSignals', () => {
  it('returns empty array when nothing triggers', () => {
    const bars = Array.from({ length: 25 }, (_, i) => mkBar(50, i));
    expect(detectAllSignals(bars)).toEqual([]);
  });

  it('marks SIG-02 breakout as downgraded when volume is not confirmed', () => {
    const bars: PriceBar[] = [];
    // 20 bars of volume 1M for avg
    for (let i = 0; i < 20; i++) bars.push(mkBar(90, i));
    // 12 bars below MA200 (close=95)
    for (let i = 20; i < 32; i++) bars.push(mkBar(95, i));
    // 2 bars above with same volume → not confirmed
    bars.push(mkBar(105, 32));
    bars.push(mkBar(106, 33));

    const results = detectAllSignals(bars);
    const sig02 = results.find((s) => s.signalType === 'SIG-02');
    expect(sig02).toBeDefined();
    expect(sig02!.volumeConfirmed).toBe(false);
    expect(sig02!.downgraded).toBe(true);
    expect(sig02!.strength).toBe('medium'); // strong → medium
  });

  it('keeps strength when volume is confirmed', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 20; i++) bars.push(mkBar(90, i));
    for (let i = 20; i < 32; i++) bars.push(mkBar(95, i));
    bars.push(mkBar(105, 32, { volume: 2_000_000 }));
    bars.push(mkBar(106, 33, { volume: 2_000_000 }));

    const results = detectAllSignals(bars);
    const sig02 = results.find((s) => s.signalType === 'SIG-02');
    expect(sig02).toBeDefined();
    expect(sig02!.volumeConfirmed).toBe(true);
    expect(sig02!.downgraded).toBe(false);
    expect(sig02!.strength).toBe('strong');
  });
});
