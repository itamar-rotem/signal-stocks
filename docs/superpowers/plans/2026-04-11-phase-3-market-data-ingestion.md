# Phase 3 — Market Data Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an FMP-backed market data ingestion pipeline that fetches historical EOD prices, computes MA150/MA200 and their 5-day slopes, and upserts everything into `daily_prices`. Fully unit-tested through pure functions; the HTTP and DB I/O orchestrator is thin glue that will be covered by integration tests once a test DB exists in Phase 8.

**Architecture:** Clean separation between (a) a typed FMP client that returns validated response objects, (b) pure computation functions for SMA and slope that operate on plain number arrays, (c) a pure transform that flattens an FMP historical response into `daily_prices` insert rows with MAs attached, and (d) a thin orchestrator + CLI that composes the above with the Drizzle client. No live FMP calls run during this plan — the client is fully implemented but only exercised in tests via recorded fixtures. The user provides an `FMP_API_KEY` in `.env.local` and runs `pnpm ingest:prices` after Phase 3 lands.

**Tech Stack:** Native `fetch` (Next.js 16 provides it globally), zod 4.3.6 for response validation, Drizzle ORM 0.45.2 with `onConflictDoUpdate`, Vitest 4.1.4 with recorded JSON fixtures.

---

## Context You Need Before Starting

1. **Phase 2 is complete.** The `daily_prices` table exists in the Drizzle schema at `src/server/db/schema/stocks.ts`. Its columns: `id, stockId, date, open, high, low, close, volume, ma150, ma200, ma150Slope, ma200Slope`. Unique index on `(stock_id, date)`.
2. **Numeric columns return strings in JS.** Drizzle's default for `numeric(p, s)` is `string` to preserve precision. Any time you read `close` from the DB or write `ma150` back, you are passing strings. Pure computation functions in this plan take and return `number`; conversion happens only at the DB boundary inside `transform.ts` and `ingestion.ts`.
3. **FMP free tier:** 250 req/day. The historical endpoint `/historical-price-full/{ticker}` returns up to 5 years per call. For our 30-seed universe we need ~30 requests to fully backfill. The live fetch is not run during this plan.
4. **FMP response shape** (source: FMP public API docs; fixture files in this plan match this shape):
   ```json
   {
     "symbol": "AAPL",
     "historical": [
       { "date": "2026-04-10", "open": 175.50, "high": 176.80, "low": 175.10, "close": 176.20, "volume": 58000000, ... },
       ...
     ]
   }
   ```
   `historical` is returned newest-first by FMP. All our logic sorts ascending before computing MAs — this is load-bearing.
5. **Universe lookup:** the ingestion orchestrator needs to map ticker → `stocks.id`. Do this in a single query at the start (`select id, ticker from stocks where ticker in (...)`).
6. **No live DB writes in this plan.** `DATABASE_URL` is still a placeholder. Do not run `pnpm ingest:prices` or `pnpm db:push`. The plan ends at a committed, tested CLI entrypoint that the user runs after provisioning Neon + FMP credentials.
7. **Branch:** work directly on `main` per the user's standing autonomy instruction. Commit after each task with Conventional Commits format.

---

## File Structure

Files to create:

```
src/server/services/
  market-data/
    schemas.ts               # zod schemas for FMP responses
    schemas.test.ts          # parser tests against small fixture
    fmp-client.ts            # HTTP wrapper (thin, not tested directly)
    fixtures/
      aapl-historical-small.json   # 10-row fixture for parser test
    moving-averages.ts       # computeSMA, computeSlope (pure)
    moving-averages.test.ts
    transform.ts             # fmpHistoricalToDbRows (pure)
    transform.test.ts
    ingestion.ts             # orchestrator (no tests this phase)
    cli.ts                   # CLI entrypoint for `pnpm ingest:prices`
    index.ts                 # barrel export
```

Files to modify:

```
src/lib/env.ts               # add FMP_API_KEY (server, optional with sensible default)
package.json                 # add "ingest:prices" script
.env.example                 # document FMP_API_KEY
CLAUDE.md                    # document market-data service layout
```

---

## Task 1: Extend env validation with FMP_API_KEY

**Files:**

- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Modify: `.env.local` (local only, gitignored — only if the file exists; set a placeholder so `pnpm build` still passes without crashing)

- [ ] **Step 1: Add `FMP_API_KEY` to env schema**

Read `src/lib/env.ts`. In the `server` block, add:

```typescript
    FMP_API_KEY: z.string().min(1).default('missing-fmp-key'),
```

**Why a default instead of required:** the build should not fail when the user hasn't wired the key yet. The FMP client will throw a clear error at runtime if the default is detected.

Then add `FMP_API_KEY: process.env.FMP_API_KEY` to the `runtimeEnv` block.

- [ ] **Step 2: Document in `.env.example`**

Append:

```
# Financial Modeling Prep — https://site.financialmodelingprep.com/developer/docs
# Free tier: 250 req/day. Required for Phase 3+ market data ingestion.
FMP_API_KEY=
```

- [ ] **Step 3: Add placeholder to `.env.local` if it exists**

If `.env.local` exists (it does — Phase 1 created it), append:

```
FMP_API_KEY=missing-fmp-key
```

Skip this step if the file doesn't exist.

- [ ] **Step 4: Verify build still passes**

```bash
pnpm build
```

Expected: compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(env): add FMP_API_KEY to typed environment validation"
```

---

## Task 2: FMP response schemas with TDD

**Files:**

- Create: `src/server/services/market-data/schemas.ts`
- Create: `src/server/services/market-data/schemas.test.ts`
- Create: `src/server/services/market-data/fixtures/aapl-historical-small.json`

- [ ] **Step 1: Create the fixture file first**

Create `src/server/services/market-data/fixtures/aapl-historical-small.json`. This mirrors FMP's `/historical-price-full/AAPL` response shape. Ten rows is enough to validate parsing without being noisy. Dates are synthetic (descending, as FMP returns them):

```json
{
  "symbol": "AAPL",
  "historical": [
    {
      "date": "2026-04-10",
      "open": 175.5,
      "high": 176.8,
      "low": 175.1,
      "close": 176.2,
      "volume": 58000000,
      "unadjustedVolume": 58000000,
      "change": 0.7,
      "changePercent": 0.399,
      "vwap": 176.03,
      "label": "April 10, 26",
      "changeOverTime": 0.00399
    },
    {
      "date": "2026-04-09",
      "open": 174.2,
      "high": 175.9,
      "low": 174.0,
      "close": 175.5,
      "volume": 54300000,
      "unadjustedVolume": 54300000,
      "change": 1.3,
      "changePercent": 0.746,
      "vwap": 175.13,
      "label": "April 09, 26",
      "changeOverTime": 0.00746
    },
    {
      "date": "2026-04-08",
      "open": 173.9,
      "high": 174.6,
      "low": 173.2,
      "close": 174.2,
      "volume": 49800000,
      "unadjustedVolume": 49800000,
      "change": 0.3,
      "changePercent": 0.173,
      "vwap": 174.0,
      "label": "April 08, 26",
      "changeOverTime": 0.00173
    },
    {
      "date": "2026-04-07",
      "open": 172.5,
      "high": 174.2,
      "low": 172.1,
      "close": 173.9,
      "volume": 61200000,
      "unadjustedVolume": 61200000,
      "change": 1.4,
      "changePercent": 0.812,
      "vwap": 173.4,
      "label": "April 07, 26",
      "changeOverTime": 0.00812
    },
    {
      "date": "2026-04-04",
      "open": 171.8,
      "high": 173.0,
      "low": 171.3,
      "close": 172.5,
      "volume": 52400000,
      "unadjustedVolume": 52400000,
      "change": 0.7,
      "changePercent": 0.408,
      "vwap": 172.27,
      "label": "April 04, 26",
      "changeOverTime": 0.00408
    },
    {
      "date": "2026-04-03",
      "open": 170.9,
      "high": 172.1,
      "low": 170.5,
      "close": 171.8,
      "volume": 48900000,
      "unadjustedVolume": 48900000,
      "change": 0.9,
      "changePercent": 0.527,
      "vwap": 171.47,
      "label": "April 03, 26",
      "changeOverTime": 0.00527
    },
    {
      "date": "2026-04-02",
      "open": 170.1,
      "high": 171.3,
      "low": 169.8,
      "close": 170.9,
      "volume": 45600000,
      "unadjustedVolume": 45600000,
      "change": 0.8,
      "changePercent": 0.47,
      "vwap": 170.67,
      "label": "April 02, 26",
      "changeOverTime": 0.0047
    },
    {
      "date": "2026-04-01",
      "open": 169.5,
      "high": 170.4,
      "low": 169.2,
      "close": 170.1,
      "volume": 50100000,
      "unadjustedVolume": 50100000,
      "change": 0.6,
      "changePercent": 0.354,
      "vwap": 169.9,
      "label": "April 01, 26",
      "changeOverTime": 0.00354
    },
    {
      "date": "2026-03-31",
      "open": 168.9,
      "high": 169.8,
      "low": 168.5,
      "close": 169.5,
      "volume": 47300000,
      "unadjustedVolume": 47300000,
      "change": 0.6,
      "changePercent": 0.355,
      "vwap": 169.23,
      "label": "March 31, 26",
      "changeOverTime": 0.00355
    },
    {
      "date": "2026-03-28",
      "open": 168.2,
      "high": 169.1,
      "low": 167.9,
      "close": 168.9,
      "volume": 43800000,
      "unadjustedVolume": 43800000,
      "change": 0.7,
      "changePercent": 0.416,
      "vwap": 168.63,
      "label": "March 28, 26",
      "changeOverTime": 0.00416
    }
  ]
}
```

- [ ] **Step 2: Write the failing schema test**

Create `src/server/services/market-data/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FmpHistoricalResponseSchema, parseFmpHistorical } from './schemas';
import fixture from './fixtures/aapl-historical-small.json';

describe('FmpHistoricalResponseSchema', () => {
  it('parses a valid FMP historical response', () => {
    const result = FmpHistoricalResponseSchema.parse(fixture);
    expect(result.symbol).toBe('AAPL');
    expect(result.historical).toHaveLength(10);
    expect(result.historical[0].date).toBe('2026-04-10');
    expect(result.historical[0].close).toBe(176.2);
  });

  it('ignores unknown fields on historical entries', () => {
    const input = {
      symbol: 'TEST',
      historical: [
        {
          date: '2026-01-01',
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          someUnknownField: 'ignored',
        },
      ],
    };
    const result = FmpHistoricalResponseSchema.parse(input);
    expect(result.historical[0].close).toBe(100.5);
  });

  it('rejects missing required fields', () => {
    const input = {
      symbol: 'TEST',
      historical: [{ date: '2026-01-01', open: 100 }],
    };
    expect(() => FmpHistoricalResponseSchema.parse(input)).toThrow();
  });

  it('rejects non-ISO date strings', () => {
    const input = {
      symbol: 'TEST',
      historical: [
        {
          date: '04/10/2026',
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        },
      ],
    };
    expect(() => FmpHistoricalResponseSchema.parse(input)).toThrow();
  });
});

describe('parseFmpHistorical', () => {
  it('returns historical rows sorted ASCENDING by date', () => {
    const result = parseFmpHistorical(fixture);
    expect(result.symbol).toBe('AAPL');
    // fixture is newest-first (2026-04-10) -- parser should reverse to oldest-first
    expect(result.historical[0].date).toBe('2026-03-28');
    expect(result.historical[9].date).toBe('2026-04-10');
  });

  it('closes are in chronological order', () => {
    const result = parseFmpHistorical(fixture);
    const dates = result.historical.map((r) => r.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL (module not found)**

```bash
pnpm test:run src/server/services/market-data/schemas.test.ts
```

Expected: FAIL — `Cannot find module './schemas'`.

- [ ] **Step 4: Implement `schemas.ts`**

Create `src/server/services/market-data/schemas.ts`:

```typescript
import { z } from 'zod';

export const FmpHistoricalEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number().int().nonnegative(),
  })
  .passthrough();

export const FmpHistoricalResponseSchema = z.object({
  symbol: z.string().min(1),
  historical: z.array(FmpHistoricalEntrySchema),
});

export type FmpHistoricalEntry = z.infer<typeof FmpHistoricalEntrySchema>;
export type FmpHistoricalResponse = z.infer<typeof FmpHistoricalResponseSchema>;

/**
 * Parse + normalize an FMP historical-price-full response.
 * FMP returns rows newest-first; we reverse to chronological ascending order,
 * which is required for all downstream MA and slope computation.
 */
export function parseFmpHistorical(raw: unknown): FmpHistoricalResponse {
  const parsed = FmpHistoricalResponseSchema.parse(raw);
  return {
    symbol: parsed.symbol,
    historical: [...parsed.historical].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
```

- [ ] **Step 5: Re-run test — expect PASS (6/6)**

```bash
pnpm test:run src/server/services/market-data/schemas.test.ts
```

Expected: `Tests 6 passed (6)`.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/market-data/schemas.ts src/server/services/market-data/schemas.test.ts src/server/services/market-data/fixtures/aapl-historical-small.json
git commit -m "feat(market-data): add FMP response schemas with zod validation"
```

---

## Task 3: FMP HTTP client

**Files:**

- Create: `src/server/services/market-data/fmp-client.ts`

No tests this task — the FMP client is a thin fetch wrapper. Its parsing layer is already tested in Task 2. Hitting the real FMP endpoint would require a live API key and network access, which is out of scope.

- [ ] **Step 1: Create `fmp-client.ts`**

```typescript
import { env } from '@/lib/env';
import { parseFmpHistorical, type FmpHistoricalResponse } from './schemas';

const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

export class FmpApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'FmpApiError';
  }
}

export interface MarketDataProvider {
  getHistoricalPrices(ticker: string): Promise<FmpHistoricalResponse>;
}

/**
 * Thin wrapper around FMP's historical-price-full endpoint.
 * Returns parsed, date-ascending historical rows.
 *
 * Throws FmpApiError on HTTP failure, zod validation failure, or missing key.
 */
export class FmpClient implements MarketDataProvider {
  constructor(private readonly apiKey: string = env.FMP_API_KEY) {
    if (!this.apiKey || this.apiKey === 'missing-fmp-key') {
      // Defer the throw until a call is attempted — lets the client be
      // constructed in contexts where the key isn't needed (e.g. type-only imports).
    }
  }

  async getHistoricalPrices(ticker: string): Promise<FmpHistoricalResponse> {
    if (!this.apiKey || this.apiKey === 'missing-fmp-key') {
      throw new FmpApiError(
        'FMP_API_KEY is not set. Add it to .env.local before running ingestion.',
      );
    }

    const url = `${FMP_BASE_URL}/historical-price-full/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(this.apiKey)}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new FmpApiError(
        `Network error fetching ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new FmpApiError(`FMP returned ${response.status} for ${ticker}`, response.status);
    }

    const json: unknown = await response.json();
    try {
      return parseFmpHistorical(json);
    } catch (err) {
      throw new FmpApiError(
        `FMP response failed schema validation for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/market-data/fmp-client.ts
git commit -m "feat(market-data): add FMP HTTP client with typed error surface"
```

---

## Task 4: Moving average computation with TDD

**Files:**

- Create: `src/server/services/market-data/moving-averages.ts`
- Create: `src/server/services/market-data/moving-averages.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/server/services/market-data/moving-averages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeSMA, computeSlope } from './moving-averages';

describe('computeSMA', () => {
  it('returns null for positions before the window is full', () => {
    const closes = [10, 11, 12, 13, 14];
    const result = computeSMA(closes, 3);
    expect(result).toEqual([null, null, 11, 12, 13]);
  });

  it('computes a simple 3-period average', () => {
    const closes = [1, 2, 3, 4, 5, 6];
    const result = computeSMA(closes, 3);
    expect(result).toEqual([null, null, 2, 3, 4, 5]);
  });

  it('handles window size equal to series length', () => {
    const closes = [10, 20, 30];
    const result = computeSMA(closes, 3);
    expect(result).toEqual([null, null, 20]);
  });

  it('returns all nulls if series is shorter than window', () => {
    const closes = [10, 20];
    const result = computeSMA(closes, 3);
    expect(result).toEqual([null, null]);
  });

  it('returns empty array on empty input', () => {
    expect(computeSMA([], 5)).toEqual([]);
  });

  it('throws on non-positive window', () => {
    expect(() => computeSMA([1, 2, 3], 0)).toThrow();
    expect(() => computeSMA([1, 2, 3], -1)).toThrow();
  });

  it('preserves precision — no floating drift over 200 values', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i * 0.1);
    const result = computeSMA(closes, 200);
    expect(result[199]).toBeCloseTo(109.95, 2);
    expect(result[249]).toBeCloseTo(114.95, 2);
  });
});

describe('computeSlope', () => {
  it('returns null for positions before the lookback is available', () => {
    const series = [100, 101, 102, 103, 104];
    const result = computeSlope(series, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
  });

  it('returns positive slope for ascending series', () => {
    const series = [100, 101, 102, 103, 104, 105];
    const result = computeSlope(series, 5);
    expect(result[5]).toBeGreaterThan(0);
  });

  it('returns negative slope for descending series', () => {
    const series = [105, 104, 103, 102, 101, 100];
    const result = computeSlope(series, 5);
    expect(result[5]).toBeLessThan(0);
  });

  it('returns zero slope for flat series', () => {
    const series = [100, 100, 100, 100, 100, 100];
    const result = computeSlope(series, 5);
    expect(result[5]).toBe(0);
  });

  it('propagates nulls in the input series', () => {
    const series: (number | null)[] = [null, null, 100, 101, 102, 103];
    const result = computeSlope(series, 3);
    // position 5 looks back to position 2 (100), ok
    expect(result[5]).toBeCloseTo((103 - 100) / 3, 6);
    // position 2 looks back to position -1, null
    expect(result[2]).toBeNull();
  });

  it('returns null when lookback value is null', () => {
    const series: (number | null)[] = [100, null, 102, 103, 104, 105];
    const result = computeSlope(series, 4);
    // position 4 looks back to position 0 (100), ok
    expect(result[4]).toBeCloseTo((104 - 100) / 4, 6);
    // position 5 looks back to position 1 (null)
    expect(result[5]).toBeNull();
  });

  it('throws on non-positive lookback', () => {
    expect(() => computeSlope([1, 2, 3], 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL (module not found)**

```bash
pnpm test:run src/server/services/market-data/moving-averages.test.ts
```

Expected: all tests fail with module resolution error.

- [ ] **Step 3: Implement `moving-averages.ts`**

Create `src/server/services/market-data/moving-averages.ts`:

```typescript
/**
 * Simple moving average over a numeric series.
 * Returns an array the same length as input; positions before the window
 * is fully populated are null.
 *
 * @param closes - series of close prices in chronological (ascending) order
 * @param window - window size (e.g. 150, 200)
 */
export function computeSMA(closes: number[], window: number): (number | null)[] {
  if (window <= 0) {
    throw new Error(`computeSMA: window must be positive, got ${window}`);
  }
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < window) return result;

  let runningSum = 0;
  for (let i = 0; i < window; i++) {
    runningSum += closes[i];
  }
  result[window - 1] = runningSum / window;

  for (let i = window; i < closes.length; i++) {
    runningSum += closes[i] - closes[i - window];
    result[i] = runningSum / window;
  }

  return result;
}

/**
 * Per-period slope of a (possibly sparse) series over a fixed lookback.
 * For each position i, computes (series[i] - series[i - lookback]) / lookback.
 * Returns null where either endpoint is null or the lookback is not yet
 * available.
 *
 * @param series - values in chronological order; may contain nulls
 * @param lookback - number of periods to look back (e.g. 5 for a 5-day slope)
 */
export function computeSlope(series: (number | null)[], lookback: number): (number | null)[] {
  if (lookback <= 0) {
    throw new Error(`computeSlope: lookback must be positive, got ${lookback}`);
  }
  const result: (number | null)[] = new Array(series.length).fill(null);
  for (let i = lookback; i < series.length; i++) {
    const current = series[i];
    const past = series[i - lookback];
    if (current === null || past === null) continue;
    result[i] = (current - past) / lookback;
  }
  return result;
}
```

- [ ] **Step 4: Re-run tests — expect PASS (15/15)**

```bash
pnpm test:run src/server/services/market-data/moving-averages.test.ts
```

Expected: `Tests 15 passed (15)`.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/market-data/moving-averages.ts src/server/services/market-data/moving-averages.test.ts
git commit -m "feat(market-data): add pure SMA and slope computation functions"
```

---

## Task 5: Transform FMP response → daily_prices insert rows (TDD)

**Files:**

- Create: `src/server/services/market-data/transform.ts`
- Create: `src/server/services/market-data/transform.test.ts`

This task bridges the pure computation layer with Drizzle's `daily_prices` insert shape. Drizzle's `numeric` columns expect strings to preserve precision — the transform converts numeric inputs to strings at the boundary.

- [ ] **Step 1: Write failing tests**

Create `src/server/services/market-data/transform.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fmpHistoricalToDbRows } from './transform';
import type { FmpHistoricalResponse } from './schemas';

function buildFixture(days: number): FmpHistoricalResponse {
  const historical = Array.from({ length: days }, (_, i) => {
    const d = new Date('2026-01-01');
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 1_000_000 + i * 100,
    };
  });
  return { symbol: 'TEST', historical };
}

describe('fmpHistoricalToDbRows', () => {
  it('returns one row per historical entry', () => {
    const fixture = buildFixture(10);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows).toHaveLength(10);
  });

  it('sets stockId on every row', () => {
    const fixture = buildFixture(5);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows.every((r) => r.stockId === 42)).toBe(true);
  });

  it('converts numeric price fields to strings for Drizzle', () => {
    const fixture = buildFixture(1);
    const [row] = fmpHistoricalToDbRows(fixture, 42);
    expect(typeof row.open).toBe('string');
    expect(typeof row.close).toBe('string');
    expect(row.close).toBe('100');
  });

  it('preserves volume as number (bigint column mode: number)', () => {
    const fixture = buildFixture(1);
    const [row] = fmpHistoricalToDbRows(fixture, 42);
    expect(typeof row.volume).toBe('number');
    expect(row.volume).toBe(1_000_000);
  });

  it('sets ma150/ma200 to null for early rows before window is reached', () => {
    const fixture = buildFixture(50);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows[0].ma150).toBeNull();
    expect(rows[0].ma200).toBeNull();
    expect(rows[49].ma150).toBeNull();
  });

  it('computes ma150 once 150 rows are available', () => {
    const fixture = buildFixture(160);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows[148].ma150).toBeNull();
    expect(rows[149].ma150).not.toBeNull();
    // mean of closes 100..249 is 174.5; stored as string
    expect(Number(rows[149].ma150)).toBeCloseTo(174.5, 2);
  });

  it('computes ma200 and a 5-day ma200 slope once 205+ rows are available', () => {
    const fixture = buildFixture(210);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows[199].ma200).not.toBeNull();
    expect(rows[204].ma200Slope).not.toBeNull();
    // MA is monotonically increasing (+1/day), 5-day slope of MA ≈ 1
    expect(Number(rows[204].ma200Slope)).toBeCloseTo(1, 2);
  });

  it('returns empty array for empty historical', () => {
    const rows = fmpHistoricalToDbRows({ symbol: 'TEST', historical: [] }, 42);
    expect(rows).toEqual([]);
  });

  it('assumes input is already ascending (parseFmpHistorical guarantees this)', () => {
    const fixture = buildFixture(3);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows[0].date).toBe('2026-01-01');
    expect(rows[2].date).toBe('2026-01-03');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test:run src/server/services/market-data/transform.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `transform.ts`**

Create `src/server/services/market-data/transform.ts`:

```typescript
import type { FmpHistoricalResponse } from './schemas';
import { computeSMA, computeSlope } from './moving-averages';

/**
 * Shape of a row insert for `daily_prices`. Matches the Drizzle schema:
 * numeric columns are strings, bigint (volume) is a number, date is
 * an ISO YYYY-MM-DD string.
 *
 * Kept as a plain interface (not inferred from Drizzle's insert type)
 * to keep the transform layer independent of the schema file's evolution.
 */
export interface DailyPriceInsertRow {
  stockId: number;
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
  ma150: string | null;
  ma200: string | null;
  ma150Slope: string | null;
  ma200Slope: string | null;
}

const MA150_WINDOW = 150;
const MA200_WINDOW = 200;
const SLOPE_LOOKBACK = 5;

/**
 * Transform an FMP historical response into `daily_prices` insert rows with
 * MA150, MA200, and 5-day slopes pre-computed.
 *
 * Input MUST be in ascending chronological order (parseFmpHistorical guarantees
 * this). Numeric values are converted to strings at the boundary to match
 * Drizzle's default handling of `numeric(p, s)` columns.
 */
export function fmpHistoricalToDbRows(
  response: FmpHistoricalResponse,
  stockId: number,
): DailyPriceInsertRow[] {
  const { historical } = response;
  if (historical.length === 0) return [];

  const closes = historical.map((h) => h.close);
  const ma150 = computeSMA(closes, MA150_WINDOW);
  const ma200 = computeSMA(closes, MA200_WINDOW);
  const ma150Slope = computeSlope(ma150, SLOPE_LOOKBACK);
  const ma200Slope = computeSlope(ma200, SLOPE_LOOKBACK);

  return historical.map((h, i) => ({
    stockId,
    date: h.date,
    open: String(h.open),
    high: String(h.high),
    low: String(h.low),
    close: String(h.close),
    volume: h.volume,
    ma150: ma150[i] === null ? null : String(ma150[i]),
    ma200: ma200[i] === null ? null : String(ma200[i]),
    ma150Slope: ma150Slope[i] === null ? null : String(ma150Slope[i]),
    ma200Slope: ma200Slope[i] === null ? null : String(ma200Slope[i]),
  }));
}
```

- [ ] **Step 4: Re-run tests — expect PASS (9/9)**

```bash
pnpm test:run src/server/services/market-data/transform.test.ts
```

Expected: `Tests 9 passed (9)`.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/market-data/transform.ts src/server/services/market-data/transform.test.ts
git commit -m "feat(market-data): add pure FMP→daily_prices transform with MA computation"
```

---

## Task 6: Ingestion orchestrator

**Files:**

- Create: `src/server/services/market-data/ingestion.ts`

No unit tests — this is thin I/O glue. Each piece it composes (FMP client, transform, SMA) is already fully tested. End-to-end integration with a real test DB is deferred to Phase 8 when the Inngest pipeline arrives.

- [ ] **Step 1: Create `ingestion.ts`**

```typescript
import { inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { stocks, dailyPrices } from '@/server/db/schema';
import { FmpClient, type MarketDataProvider } from './fmp-client';
import { fmpHistoricalToDbRows } from './transform';

export interface IngestResult {
  ticker: string;
  stockId: number;
  rowsUpserted: number;
}

export interface IngestSummary {
  results: IngestResult[];
  errors: { ticker: string; error: string }[];
}

/**
 * Fetch historical prices for every ticker, compute MAs + slopes, and upsert
 * into `daily_prices`.
 *
 * - Lookup stock IDs in one query, skipping tickers not in the `stocks` table.
 * - Per-ticker failures are captured in `errors` and do not abort the run.
 * - Upsert strategy: on conflict (stock_id, date) → overwrite OHLCV + MAs.
 *   This lets re-runs heal partial or stale data.
 */
export async function ingestPricesForTickers(
  tickers: string[],
  provider: MarketDataProvider = new FmpClient(),
): Promise<IngestSummary> {
  const summary: IngestSummary = { results: [], errors: [] };
  if (tickers.length === 0) return summary;

  const universe = await db
    .select({ id: stocks.id, ticker: stocks.ticker })
    .from(stocks)
    .where(inArray(stocks.ticker, tickers));

  const tickerToId = new Map(universe.map((row) => [row.ticker, row.id]));

  for (const ticker of tickers) {
    const stockId = tickerToId.get(ticker);
    if (stockId === undefined) {
      summary.errors.push({
        ticker,
        error: `Ticker not found in stocks table — run pnpm db:seed first`,
      });
      continue;
    }

    try {
      const response = await provider.getHistoricalPrices(ticker);
      const rows = fmpHistoricalToDbRows(response, stockId);
      if (rows.length === 0) {
        summary.results.push({ ticker, stockId, rowsUpserted: 0 });
        continue;
      }

      await db
        .insert(dailyPrices)
        .values(rows)
        .onConflictDoUpdate({
          target: [dailyPrices.stockId, dailyPrices.date],
          set: {
            open: dailyPrices.open,
            high: dailyPrices.high,
            low: dailyPrices.low,
            close: dailyPrices.close,
            volume: dailyPrices.volume,
            ma150: dailyPrices.ma150,
            ma200: dailyPrices.ma200,
            ma150Slope: dailyPrices.ma150Slope,
            ma200Slope: dailyPrices.ma200Slope,
          },
        });

      summary.results.push({ ticker, stockId, rowsUpserted: rows.length });
    } catch (err) {
      summary.errors.push({
        ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
```

**IMPORTANT — verify the `onConflictDoUpdate` set clause.** Drizzle 0.45 expects `sql\`excluded.column_name\``references inside`set` for upserts that use the incoming row's value. If passing the column object as shown doesn't work (it becomes an unintended no-op or syntax error), replace with:

```typescript
import { sql } from 'drizzle-orm';
// ...
set: {
  open: sql`excluded.open`,
  high: sql`excluded.high`,
  low: sql`excluded.low`,
  close: sql`excluded.close`,
  volume: sql`excluded.volume`,
  ma150: sql`excluded.ma150`,
  ma200: sql`excluded.ma200`,
  ma150Slope: sql`excluded.ma150_slope`,
  ma200Slope: sql`excluded.ma200_slope`,
},
```

Decide which form to use by consulting `node_modules/drizzle-orm/pg-core/query-builders/insert.d.ts` for the correct `PgInsertOnConflictDoUpdateConfig` signature. Do not guess.

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean. If the `onConflictDoUpdate` set clause errors, switch to the `sql\`excluded.\*\`` form above and re-check.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/market-data/ingestion.ts
git commit -m "feat(market-data): add ingestion orchestrator with upsert-on-conflict"
```

---

## Task 7: Barrel + CLI entrypoint

**Files:**

- Create: `src/server/services/market-data/index.ts`
- Create: `src/server/services/market-data/cli.ts`

- [ ] **Step 1: Create the barrel**

```typescript
export { parseFmpHistorical, FmpHistoricalResponseSchema } from './schemas';
export type { FmpHistoricalResponse, FmpHistoricalEntry } from './schemas';
export { FmpClient, FmpApiError } from './fmp-client';
export type { MarketDataProvider } from './fmp-client';
export { computeSMA, computeSlope } from './moving-averages';
export { fmpHistoricalToDbRows } from './transform';
export type { DailyPriceInsertRow } from './transform';
export { ingestPricesForTickers } from './ingestion';
export type { IngestResult, IngestSummary } from './ingestion';
```

- [ ] **Step 2: Create `cli.ts`**

```typescript
/**
 * Market data ingestion CLI.
 *
 * Run with: `pnpm ingest:prices [ticker1 ticker2 ...]`
 *
 * With no arguments, loads all tickers from the stocks table and ingests them
 * serially. The FMP free tier is 250 req/day — a full universe fetch uses one
 * request per ticker. For the current 30-seed universe this is ~30 requests.
 */
import { db } from '@/server/db';
import { stocks } from '@/server/db/schema';
import { ingestPricesForTickers } from './ingestion';

async function main() {
  const argTickers = process.argv.slice(2);
  let tickers: string[];

  if (argTickers.length > 0) {
    tickers = argTickers.map((t) => t.toUpperCase());
    console.log(`Ingesting ${tickers.length} ticker(s) from CLI args...`);
  } else {
    const rows = await db.select({ ticker: stocks.ticker }).from(stocks);
    tickers = rows.map((r) => r.ticker);
    console.log(`Ingesting full universe — ${tickers.length} ticker(s)...`);
  }

  const summary = await ingestPricesForTickers(tickers);

  console.log('\n=== Ingest Summary ===');
  console.log(`Successful: ${summary.results.length}`);
  for (const r of summary.results) {
    console.log(`  ${r.ticker.padEnd(8)} → ${r.rowsUpserted} rows`);
  }
  if (summary.errors.length > 0) {
    console.log(`\nErrors: ${summary.errors.length}`);
    for (const e of summary.errors) {
      console.log(`  ${e.ticker.padEnd(8)} → ${e.error}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });
```

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/services/market-data/index.ts src/server/services/market-data/cli.ts
git commit -m "feat(market-data): add barrel export and ingest:prices CLI entrypoint"
```

---

## Task 8: Wire up `ingest:prices` npm script + final verification + docs + push

**Files:**

- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the script**

In `package.json`, under `"scripts"`, add after `"db:seed"`:

```json
"ingest:prices": "tsx src/server/services/market-data/cli.ts"
```

- [ ] **Step 2: Document in CLAUDE.md**

Read `CLAUDE.md`. In the "Running Locally" section, add after `pnpm db:seed`:

```
pnpm ingest:prices    # fetch EOD prices + compute MAs (needs FMP_API_KEY)
```

In the "Project Structure" block, replace the `services/` line. The current text in the `server/` subsection is:

```
    trpc/           tRPC routers (later)
    services/       Business logic (signals, scoring, AI, alerts) (later)
    inngest/        Pipeline step functions (later)
```

Change to:

```
    trpc/           tRPC routers (later)
    services/
      market-data/  FMP client, MA computation, EOD ingestion, cli.ts
      ...           signals, scoring, AI, alerts (later phases)
    inngest/        Pipeline step functions (later)
```

Add a new subsection under "Known API Gotchas" titled "Drizzle numeric columns":

```markdown
### Drizzle numeric columns

- Drizzle 0.45 returns `numeric(p, s)` columns as **strings** to preserve precision. Pure computation functions in `services/market-data/` operate on `number`; conversion happens only at the DB boundary inside `transform.ts` and `ingestion.ts`. Do not change this — switching to `mode: 'number'` would leak floating-point drift into stored prices.
```

- [ ] **Step 3: Final verification chain**

Run all four checks in sequence:

```bash
pnpm format
pnpm lint
pnpm test:run
pnpm build
```

Expected:

- `format` — rewrites any stragglers
- `lint` — clean
- `test:run` — all previous tests plus new ones. Expected counts: DisclaimerFooter (2) + schema smoke (9 in 1 file) + seed-parser (8) + market-data schemas (6) + moving-averages (15) + transform (9) = ~49 tests across 6 files. Exact count may vary by a few depending on Vitest's counting of `describe` vs `it`; the pass rate is what matters.
- `build` — compiles successfully, 5 routes

If `format` rewrote anything, stage those files and make a separate `style:` commit before proceeding:

```bash
git add -- $(git diff --name-only)   # only files that were actually changed
git commit -m "style: apply prettier formatting to market-data service"
```

- [ ] **Step 4: Commit script + docs**

```bash
git add package.json CLAUDE.md
git commit -m "chore(market-data): wire ingest:prices script and document Phase 3"
```

- [ ] **Step 5: Commit the Phase 3 plan file**

```bash
git add docs/superpowers/plans/2026-04-11-phase-3-market-data-ingestion.md
git commit -m "docs: add Phase 3 (market data ingestion) implementation plan"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

Expected: push succeeds to `itamar-rotem/signal-stocks`.

---

## Phase 3 Completion Criteria

- [x] FMP HTTP client with typed error surface (`FmpClient`, `FmpApiError`, `MarketDataProvider` interface)
- [x] FMP response zod schemas with ascending-sort normalization
- [x] Pure `computeSMA` and `computeSlope` functions with null-propagation semantics
- [x] Pure `fmpHistoricalToDbRows` transform that bridges to Drizzle's numeric-string convention
- [x] Orchestrator with ticker-to-stockId lookup, upsert-on-conflict, and per-ticker error isolation
- [x] CLI entrypoint runnable as `pnpm ingest:prices [tickers...]`
- [x] `FMP_API_KEY` added to env validation with safe default
- [x] All tests pass; `pnpm format:check && pnpm lint && pnpm test:run && pnpm build` clean
- [x] Pushed to `itamar-rotem/signal-stocks` main branch

## What's Needed Before Phase 4

1. User provisions a Neon DB and sets `DATABASE_URL` in `.env.local`
2. User gets a free FMP API key from https://site.financialmodelingprep.com/developer/docs and sets `FMP_API_KEY` in `.env.local`
3. Run `pnpm db:push` to create tables
4. Run `pnpm db:seed` to load the 30-ticker starter universe
5. Run `pnpm ingest:prices` to backfill EOD data for the universe (uses ~30 of the 250 daily FMP requests)
6. Spot-check the data in Drizzle Studio (`pnpm db:studio`)

Phase 4 (Fundamental Scoring) can begin once the above is done — it reuses the same FMP client pattern with a new endpoint family (`/ratios`, `/income-statement`, `/balance-sheet-statement`) and writes to the `fundamentals` table.

---

## Out of Scope for Phase 3 (Deferred)

- **Integration test with a real test DB** — deferred to Phase 8 when the Inngest pipeline adds proper test infra. A pglite-in-memory setup would work but adds a devDependency and test boilerplate not justified by Phase 3's scope.
- **FMP bulk EOD endpoint** (`/batch-request-end-of-day-prices`) — more efficient for daily incremental runs but requires the paid plan. The per-ticker historical endpoint we use here covers both backfill and incremental with one codepath.
- **Rate limiting** — serial execution with a for-loop is enough at 30 tickers. Phase 8 will add parallelism with an Inngest `step.run` per ticker, which handles retries and concurrency for free.
- **Data quality validation** — sanity checks like "close price is within 50% of yesterday's" or "volume > 0" — deferred to Phase 5 when the signal engine needs clean inputs.
- **Adjusted vs unadjusted prices** — FMP returns adjusted by default for the historical-price-full endpoint. Splits/dividends are pre-handled. Explicit handling is not needed in Phase 3.
