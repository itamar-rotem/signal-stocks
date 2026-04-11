import { describe, it, expect } from 'vitest';
import { isEligible } from './eligibility';
import type { StockContext } from './types';

const systemCtx = (overrides: Partial<StockContext> = {}): StockContext => ({
  ticker: 'TEST',
  marketCap: 1_000_000_000, // $1B
  listingDate: '2020-01-01', // ~6 years old vs today 2026-04-11
  exchange: 'NASDAQ',
  avgDailyVolume20: 1_000_000,
  fundamentalScore: 80,
  source: 'system',
  ...overrides,
});

const TODAY = '2026-04-11';
const LAST_CLOSE = 50;

describe('isEligible (system)', () => {
  it('passes a healthy large-cap US stock', () => {
    expect(isEligible(systemCtx(), LAST_CLOSE, TODAY)).toBe(true);
  });

  it('rejects market cap < $500M', () => {
    expect(isEligible(systemCtx({ marketCap: 400_000_000 }), LAST_CLOSE, TODAY)).toBe(
      false,
    );
  });

  it('rejects avg volume < 500K', () => {
    expect(isEligible(systemCtx({ avgDailyVolume20: 400_000 }), LAST_CLOSE, TODAY)).toBe(
      false,
    );
  });

  it('rejects price < $5', () => {
    expect(isEligible(systemCtx(), 4.99, TODAY)).toBe(false);
  });

  it('rejects listing age < 12 months', () => {
    expect(
      isEligible(systemCtx({ listingDate: '2025-11-01' }), LAST_CLOSE, TODAY),
    ).toBe(false);
  });

  it('rejects fundamental score < 60', () => {
    expect(isEligible(systemCtx({ fundamentalScore: 55 }), LAST_CLOSE, TODAY)).toBe(
      false,
    );
  });

  it('rejects unknown exchange', () => {
    expect(isEligible(systemCtx({ exchange: 'TSX' }), LAST_CLOSE, TODAY)).toBe(false);
  });

  it('rejects null market cap for system source', () => {
    expect(isEligible(systemCtx({ marketCap: null }), LAST_CLOSE, TODAY)).toBe(false);
  });

  it('rejects null fundamental score for system source', () => {
    expect(
      isEligible(systemCtx({ fundamentalScore: null }), LAST_CLOSE, TODAY),
    ).toBe(false);
  });
});

describe('isEligible (watchlist)', () => {
  const watchCtx = (overrides: Partial<StockContext> = {}): StockContext =>
    systemCtx({ source: 'watchlist', ...overrides });

  it('ignores market cap and fundamental score', () => {
    expect(
      isEligible(
        watchCtx({ marketCap: 100_000_000, fundamentalScore: 10 }),
        10,
        TODAY,
      ),
    ).toBe(true);
  });

  it('still enforces $2 price floor', () => {
    expect(isEligible(watchCtx(), 1.99, TODAY)).toBe(false);
  });

  it('still enforces 6-month listing age', () => {
    expect(
      isEligible(watchCtx({ listingDate: '2026-02-01' }), 10, TODAY),
    ).toBe(false);
  });

  it('accepts a 7-month-old stock', () => {
    expect(
      isEligible(watchCtx({ listingDate: '2025-08-01' }), 10, TODAY),
    ).toBe(true);
  });
});
