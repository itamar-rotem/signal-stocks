import { describe, it, expect } from 'vitest';
import type { PriceBar, DetectedSignal, StockContext, SignalStrength } from './types';

describe('signal types', () => {
  it('PriceBar holds required fields', () => {
    const bar: PriceBar = {
      date: '2026-04-10',
      close: 100,
      volume: 1_000_000,
      ma150: 95,
      ma200: 90,
      ma150Slope: 0.5,
      ma200Slope: 0.4,
    };
    expect(bar.close).toBe(100);
  });

  it('DetectedSignal shape', () => {
    const sig: DetectedSignal = {
      signalType: 'SIG-01',
      strength: 'medium',
      triggeredAt: '2026-04-10',
      volumeConfirmed: false,
      downgraded: false,
    };
    expect(sig.signalType).toBe('SIG-01');
  });

  it('SignalStrength union', () => {
    const s: SignalStrength = 'very_strong';
    expect(s).toBe('very_strong');
  });

  it('StockContext holds eligibility fields', () => {
    const ctx: StockContext = {
      ticker: 'AAPL',
      marketCap: 3_000_000_000_000,
      listingDate: '1980-12-12',
      exchange: 'NASDAQ',
      avgDailyVolume20: 50_000_000,
      fundamentalScore: 85,
      source: 'system',
    };
    expect(ctx.source).toBe('system');
  });
});
