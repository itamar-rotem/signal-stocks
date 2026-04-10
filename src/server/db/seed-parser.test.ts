import { describe, it, expect } from 'vitest';
import { parseUniverse } from './seed-parser';

describe('parseUniverse', () => {
  it('parses a valid entry', () => {
    const input = [
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        exchange: 'NASDAQ',
        sector: 'Technology',
        industry: 'Consumer Electronics',
      },
    ];
    const result = parseUniverse(input);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('AAPL');
    expect(result[0].exchange).toBe('NASDAQ');
  });

  it('accepts dot in ticker (e.g., BRK.B)', () => {
    const input = [
      {
        ticker: 'BRK.B',
        name: 'Berkshire Hathaway',
        exchange: 'NYSE',
        sector: 'Financial Services',
        industry: 'Insurance',
      },
    ];
    const result = parseUniverse(input);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('BRK.B');
  });

  it('rejects lowercase tickers', () => {
    const input = [
      {
        ticker: 'aapl',
        name: 'x',
        exchange: 'NASDAQ',
        sector: 's',
        industry: 'i',
      },
    ];
    expect(() => parseUniverse(input)).toThrow();
  });

  it('rejects non-US exchanges', () => {
    const input = [
      {
        ticker: 'SHOP',
        name: 'Shopify',
        exchange: 'TSX',
        sector: 's',
        industry: 'i',
      },
    ];
    expect(() => parseUniverse(input)).toThrow();
  });

  it('deduplicates by ticker, keeping first occurrence', () => {
    const input = [
      {
        ticker: 'AAPL',
        name: 'Apple First',
        exchange: 'NASDAQ',
        sector: 's',
        industry: 'i',
      },
      {
        ticker: 'AAPL',
        name: 'Apple Duplicate',
        exchange: 'NASDAQ',
        sector: 's',
        industry: 'i',
      },
    ];
    const result = parseUniverse(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Apple First');
  });

  it('rejects input that is not an array', () => {
    expect(() => parseUniverse({ ticker: 'AAPL' })).toThrow();
  });

  it('rejects missing required fields', () => {
    const input = [{ ticker: 'AAPL' }];
    expect(() => parseUniverse(input)).toThrow();
  });

  it('loads the committed starter universe successfully', async () => {
    const mod = await import('./seed-data/universe.json');
    const universe = mod.default;
    const parsed = parseUniverse(universe);
    expect(parsed.length).toBeGreaterThanOrEqual(30);
    expect(parsed.every((e) => ['NYSE', 'NASDAQ', 'AMEX'].includes(e.exchange))).toBe(true);
  });
});
