import { describe, it, expect } from 'vitest';
import {
  FmpRatiosSchema,
  FmpKeyMetricsSchema,
  FmpIncomeStatementSchema,
  deriveQuarter,
} from './fundamentals-schemas';
import ratiosFixture from './fixtures/aapl-ratios-small.json';
import keyMetricsFixture from './fixtures/aapl-key-metrics-small.json';
import incomeFixture from './fixtures/aapl-income-statement-small.json';

describe('FmpRatiosSchema', () => {
  it('parses valid ratios array', () => {
    const result = FmpRatiosSchema.parse(ratiosFixture);
    expect(result).toHaveLength(2);
    expect(result[0].grossProfitMargin).toBe(0.45);
    expect(result[0].period).toBe('Q1');
  });

  it('allows nullable fields', () => {
    const input = [
      {
        symbol: 'TEST',
        date: '2026-01-01',
        calendarYear: '2026',
        period: 'Q1',
        grossProfitMargin: null,
      },
    ];
    const result = FmpRatiosSchema.parse(input);
    expect(result[0].grossProfitMargin).toBeNull();
  });

  it('rejects missing symbol', () => {
    expect(() => FmpRatiosSchema.parse([{ date: '2026-01-01' }])).toThrow();
  });
});

describe('FmpKeyMetricsSchema', () => {
  it('parses valid key metrics array', () => {
    const result = FmpKeyMetricsSchema.parse(keyMetricsFixture);
    expect(result).toHaveLength(2);
    expect(result[0].roic).toBe(0.55);
  });
});

describe('FmpIncomeStatementSchema', () => {
  it('parses valid income statement array', () => {
    const result = FmpIncomeStatementSchema.parse(incomeFixture);
    expect(result).toHaveLength(3);
    expect(result[0].revenue).toBe(95_000_000_000);
  });
});

describe('deriveQuarter', () => {
  it('combines calendarYear and period', () => {
    expect(deriveQuarter('2026', 'Q1')).toBe('2026Q1');
    expect(deriveQuarter('2025', 'Q4')).toBe('2025Q4');
  });

  it('handles FY period as Q4', () => {
    expect(deriveQuarter('2026', 'FY')).toBe('2026Q4');
  });
});
