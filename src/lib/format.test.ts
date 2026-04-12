import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fmtUsd, fmtPct, fmtRelTime, fmtPnl } from './format';

describe('fmtUsd', () => {
  it('formats a round number', () => {
    expect(fmtUsd(100)).toBe('$100.00');
  });

  it('formats a decimal price', () => {
    expect(fmtUsd(102.456)).toBe('$102.46');
  });

  it('formats zero', () => {
    expect(fmtUsd(0)).toBe('$0.00');
  });
});

describe('fmtPct', () => {
  it('adds plus sign for positive', () => {
    expect(fmtPct(17.5)).toBe('+17.5%');
  });

  it('keeps minus sign for negative', () => {
    expect(fmtPct(-3.2)).toBe('-3.2%');
  });

  it('formats zero with plus', () => {
    expect(fmtPct(0)).toBe('+0.0%');
  });
});

describe('fmtRelTime', () => {
  const NOW = new Date('2026-04-11T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 60s', () => {
    expect(fmtRelTime(new Date(NOW - 30_000))).toBe('just now');
  });

  it('returns minutes ago for 1-59 min', () => {
    expect(fmtRelTime(new Date(NOW - 2 * 60_000))).toBe('2m ago');
    expect(fmtRelTime(new Date(NOW - 59 * 60_000))).toBe('59m ago');
  });

  it('returns hours ago for 1-23 hours', () => {
    expect(fmtRelTime(new Date(NOW - 3 * 3600_000))).toBe('3h ago');
    expect(fmtRelTime(new Date(NOW - 23 * 3600_000))).toBe('23h ago');
  });

  it('returns days ago for 1-6 days', () => {
    expect(fmtRelTime(new Date(NOW - 1 * 86400_000))).toBe('1d ago');
    expect(fmtRelTime(new Date(NOW - 6 * 86400_000))).toBe('6d ago');
  });

  it('returns ISO date for >= 7 days', () => {
    expect(fmtRelTime(new Date(NOW - 7 * 86400_000))).toBe('2026-04-04');
    expect(fmtRelTime(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });
});

describe('fmtPnl', () => {
  it('formats a positive P&L with + sign', () => {
    const result = fmtPnl(417);
    expect(result.text).toBe('+$417.00');
    expect(result.isPositive).toBe(true);
  });

  it('formats a negative P&L with - sign', () => {
    const result = fmtPnl(-150.5);
    expect(result.text).toBe('-$150.50');
    expect(result.isPositive).toBe(false);
  });

  it('formats zero as positive', () => {
    const result = fmtPnl(0);
    expect(result.text).toBe('+$0.00');
    expect(result.isPositive).toBe(true);
  });

  it('formats fractional P&L correctly', () => {
    const result = fmtPnl(13.9 * 30);
    expect(result.text).toBe('+$417.00');
    expect(result.isPositive).toBe(true);
  });
});
