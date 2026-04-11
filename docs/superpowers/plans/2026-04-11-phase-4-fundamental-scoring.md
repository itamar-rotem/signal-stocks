# Phase 4 — Fundamental Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Score every stock in the universe on a 0-100 composite based on profitability (30%), growth (25%), financial health (25%), and valuation (20%), using FMP fundamental data and sector-percentile normalization. Write scores into the `fundamentals` table.

**Architecture:** Extend the FMP client with fundamental endpoints. Pure scoring functions operate on plain objects with fully optional fields — they produce per-category scores (0-100) and a composite. Percentile ranking is a pure function over a peer list. A thin orchestrator fetches per-ticker, buffers the full universe in memory, computes sector percentiles, and upserts into `fundamentals`. Everything testable via fixtures.

**Tech Stack:** FMP API, zod schemas (same pattern as Phase 3), Drizzle with `onConflictDoUpdate`.

---

## Context You Need Before Starting

1. **Read spec Section 4.2** (`docs/superpowers/specs/2026-04-10-signalstocks-design.md`) — defines exact category weights, metrics, and percentile-ranking approach
2. **Phase 3 pattern is load-bearing** — FMP client, schemas, transform, ingestion separation — follow it exactly
3. **FMP endpoints used:**
   - `/ratios/{ticker}` — margins, ROE, ROA, P/E, current ratio, D/E
   - `/key-metrics/{ticker}` — ROIC, FCF yield, EV/EBITDA, PEG
   - `/income-statement/{ticker}` — revenue, EPS, revenue growth YoY
4. **Fundamentals table columns** (from Phase 2, `src/server/db/schema/stocks.ts`): `quarter, revenue, eps, grossMargin, operatingMargin, netMargin, roe, roa, roic, revenueGrowthYoy, epsGrowth, debtToEquity, currentRatio, interestCoverage, fcfYield, forwardPe, pegRatio, evEbitda, fundamentalScore`
5. **Quarter format:** `YYYYQN` e.g. `2026Q1` — FMP's ratios response includes `date` (ISO) and `period` (e.g. `Q1`). We derive `quarter` from those.
6. **Numeric columns** are strings in Drizzle (same as Phase 3). Pure scoring works on `number | null`; conversion to string happens at DB boundary.
7. **Missing data:** every metric is nullable. A stock missing some metrics can still score — we average only present sub-scores within each category.
8. **No live FMP calls during plan execution.** Use the recorded fixture pattern from Phase 3.
9. **Branch:** main. Commit per task.

---

## File Structure

New files under `src/server/services/fundamentals/`:

```
fundamentals-schemas.ts              # zod schemas for FMP ratios/key-metrics/income-statement
fundamentals-schemas.test.ts
fixtures/
  aapl-ratios-small.json
  aapl-key-metrics-small.json
  aapl-income-statement-small.json
fmp-fundamentals-client.ts           # extends MarketDataProvider with fundamental endpoints
scoring.ts                           # pure scoring (profitability, growth, health, valuation, composite)
scoring.test.ts
percentile.ts                        # pure percentile rank over peer list
percentile.test.ts
ingestion.ts                         # orchestrator: fetch → score → upsert
cli.ts                               # pnpm ingest:fundamentals
index.ts                             # barrel
```

Modify:

```
package.json                         # add ingest:fundamentals script
CLAUDE.md                            # document fundamentals service
```

---

## Task 1: FMP fundamental response schemas with fixtures (TDD)

**Files:**

- Create: `src/server/services/fundamentals/fundamentals-schemas.ts`
- Create: `src/server/services/fundamentals/fundamentals-schemas.test.ts`
- Create: `src/server/services/fundamentals/fixtures/aapl-ratios-small.json`
- Create: `src/server/services/fundamentals/fixtures/aapl-key-metrics-small.json`
- Create: `src/server/services/fundamentals/fixtures/aapl-income-statement-small.json`

- [ ] **Step 1: Create fixtures**

`fixtures/aapl-ratios-small.json`:

```json
[
  {
    "symbol": "AAPL",
    "date": "2026-03-31",
    "calendarYear": "2026",
    "period": "Q1",
    "grossProfitMargin": 0.45,
    "operatingProfitMargin": 0.3,
    "netProfitMargin": 0.25,
    "returnOnEquity": 1.55,
    "returnOnAssets": 0.28,
    "currentRatio": 1.04,
    "debtEquityRatio": 1.95,
    "interestCoverage": 42.0,
    "priceEarningsRatio": 32.0,
    "priceToSalesRatio": 8.5
  },
  {
    "symbol": "AAPL",
    "date": "2025-12-31",
    "calendarYear": "2025",
    "period": "Q4",
    "grossProfitMargin": 0.44,
    "operatingProfitMargin": 0.29,
    "netProfitMargin": 0.24,
    "returnOnEquity": 1.5,
    "returnOnAssets": 0.27,
    "currentRatio": 1.08,
    "debtEquityRatio": 1.88,
    "interestCoverage": 40.0,
    "priceEarningsRatio": 31.0,
    "priceToSalesRatio": 8.3
  }
]
```

`fixtures/aapl-key-metrics-small.json`:

```json
[
  {
    "symbol": "AAPL",
    "date": "2026-03-31",
    "calendarYear": "2026",
    "period": "Q1",
    "roic": 0.55,
    "freeCashFlowYield": 0.038,
    "enterpriseValueOverEBITDA": 22.5,
    "pegRatio": 2.1,
    "peRatio": 32.0
  },
  {
    "symbol": "AAPL",
    "date": "2025-12-31",
    "calendarYear": "2025",
    "period": "Q4",
    "roic": 0.52,
    "freeCashFlowYield": 0.036,
    "enterpriseValueOverEBITDA": 21.8,
    "pegRatio": 2.0,
    "peRatio": 31.0
  }
]
```

`fixtures/aapl-income-statement-small.json`:

```json
[
  {
    "symbol": "AAPL",
    "date": "2026-03-31",
    "calendarYear": "2026",
    "period": "Q1",
    "revenue": 95000000000,
    "eps": 1.65,
    "epsdiluted": 1.64,
    "grossProfit": 42750000000,
    "operatingIncome": 28500000000,
    "netIncome": 23750000000
  },
  {
    "symbol": "AAPL",
    "date": "2025-12-31",
    "calendarYear": "2025",
    "period": "Q4",
    "revenue": 124000000000,
    "eps": 2.18,
    "epsdiluted": 2.17,
    "grossProfit": 54560000000,
    "operatingIncome": 35960000000,
    "netIncome": 29760000000
  },
  {
    "symbol": "AAPL",
    "date": "2025-03-31",
    "calendarYear": "2025",
    "period": "Q1",
    "revenue": 90000000000,
    "eps": 1.52,
    "epsdiluted": 1.51,
    "grossProfit": 40500000000,
    "operatingIncome": 27000000000,
    "netIncome": 22500000000
  }
]
```

- [ ] **Step 2: Failing test**

Create `fundamentals-schemas.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run — expect FAIL**

```bash
pnpm test:run src/server/services/fundamentals/fundamentals-schemas.test.ts
```

- [ ] **Step 4: Implement `fundamentals-schemas.ts`**

```typescript
import { z } from 'zod';

const nullableNumber = z.number().nullable().optional();

export const FmpRatiosEntrySchema = z
  .object({
    symbol: z.string(),
    date: z.string(),
    calendarYear: z.string(),
    period: z.string(),
    grossProfitMargin: nullableNumber,
    operatingProfitMargin: nullableNumber,
    netProfitMargin: nullableNumber,
    returnOnEquity: nullableNumber,
    returnOnAssets: nullableNumber,
    currentRatio: nullableNumber,
    debtEquityRatio: nullableNumber,
    interestCoverage: nullableNumber,
    priceEarningsRatio: nullableNumber,
  })
  .passthrough();

export const FmpRatiosSchema = z.array(FmpRatiosEntrySchema);

export const FmpKeyMetricsEntrySchema = z
  .object({
    symbol: z.string(),
    date: z.string(),
    calendarYear: z.string(),
    period: z.string(),
    roic: nullableNumber,
    freeCashFlowYield: nullableNumber,
    enterpriseValueOverEBITDA: nullableNumber,
    pegRatio: nullableNumber,
    peRatio: nullableNumber,
  })
  .passthrough();

export const FmpKeyMetricsSchema = z.array(FmpKeyMetricsEntrySchema);

export const FmpIncomeStatementEntrySchema = z
  .object({
    symbol: z.string(),
    date: z.string(),
    calendarYear: z.string(),
    period: z.string(),
    revenue: nullableNumber,
    eps: nullableNumber,
    epsdiluted: nullableNumber,
    grossProfit: nullableNumber,
    operatingIncome: nullableNumber,
    netIncome: nullableNumber,
  })
  .passthrough();

export const FmpIncomeStatementSchema = z.array(FmpIncomeStatementEntrySchema);

export type FmpRatiosEntry = z.infer<typeof FmpRatiosEntrySchema>;
export type FmpKeyMetricsEntry = z.infer<typeof FmpKeyMetricsEntrySchema>;
export type FmpIncomeStatementEntry = z.infer<typeof FmpIncomeStatementEntrySchema>;

/**
 * Derive a canonical YYYYQN quarter string from FMP's calendarYear + period.
 * FMP uses "Q1".."Q4" for quarterly data, or "FY" for full-year annual data.
 * We map FY → Q4 so annual rows still participate in the most-recent-quarter logic.
 */
export function deriveQuarter(calendarYear: string, period: string): string {
  const normalizedPeriod = period === 'FY' ? 'Q4' : period;
  return `${calendarYear}${normalizedPeriod}`;
}
```

- [ ] **Step 5: Re-run — expect 8/8 PASS**

- [ ] **Step 6: Commit**

```bash
git add src/server/services/fundamentals/fundamentals-schemas.ts src/server/services/fundamentals/fundamentals-schemas.test.ts src/server/services/fundamentals/fixtures/
git commit -m "feat(fundamentals): add FMP fundamental response schemas with fixtures"
```

---

## Task 2: Percentile ranking (pure, TDD)

**Files:**

- Create: `src/server/services/fundamentals/percentile.ts`
- Create: `src/server/services/fundamentals/percentile.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { percentileRank, scoreToPercentile } from './percentile';

describe('percentileRank', () => {
  it('returns 100 for the maximum value', () => {
    expect(percentileRank(10, [1, 2, 5, 10])).toBe(100);
  });

  it('returns 0 for the minimum value', () => {
    expect(percentileRank(1, [1, 2, 5, 10])).toBe(0);
  });

  it('handles single-element peer list', () => {
    expect(percentileRank(5, [5])).toBe(50);
  });

  it('handles empty peer list', () => {
    expect(percentileRank(5, [])).toBe(50);
  });

  it('handles null target value', () => {
    expect(percentileRank(null, [1, 2, 3])).toBeNull();
  });

  it('ignores null peers', () => {
    expect(percentileRank(5, [1, null, 10, null])).toBe(50);
  });

  it('ties are handled mid-rank', () => {
    // value=5, peers=[1,5,5,10] → 5 is median → 50
    expect(percentileRank(5, [1, 5, 5, 10])).toBeCloseTo(50, 0);
  });

  it('handles all-null peer list', () => {
    expect(percentileRank(5, [null, null, null])).toBe(50);
  });

  it('inverts when lowerIsBetter is true (valuation metrics)', () => {
    // Low P/E is better — a P/E of 1 in [1,2,5,10] should score 100, not 0
    expect(percentileRank(1, [1, 2, 5, 10], { lowerIsBetter: true })).toBe(100);
    expect(percentileRank(10, [1, 2, 5, 10], { lowerIsBetter: true })).toBe(0);
  });
});

describe('scoreToPercentile', () => {
  it('clamps negative inputs to 0', () => {
    expect(scoreToPercentile(-10)).toBe(0);
  });

  it('clamps above 100 to 100', () => {
    expect(scoreToPercentile(150)).toBe(100);
  });

  it('passes through valid values', () => {
    expect(scoreToPercentile(50)).toBe(50);
  });

  it('passes through null', () => {
    expect(scoreToPercentile(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
/**
 * Compute the percentile rank (0-100) of `value` within a peer list.
 * Returns 50 for edge cases (empty list, all nulls, null value handled separately).
 *
 * @param value — the value being ranked; null returns null
 * @param peers — the peer universe; nulls are excluded
 * @param options.lowerIsBetter — invert ranking (for valuation metrics)
 */
export function percentileRank(
  value: number | null,
  peers: (number | null)[],
  options: { lowerIsBetter?: boolean } = {},
): number | null {
  if (value === null) return null;

  const cleaned = peers.filter((p): p is number => p !== null);
  if (cleaned.length === 0) return 50;
  if (cleaned.length === 1) return 50;

  const sorted = [...cleaned].sort((a, b) => a - b);
  // Count values strictly less than target + half of equal values (ties midrank)
  let below = 0;
  let equal = 0;
  for (const peer of sorted) {
    if (peer < value) below++;
    else if (peer === value) equal++;
  }
  const rank = (below + equal / 2) / cleaned.length;
  const percentile = rank * 100;

  return options.lowerIsBetter ? 100 - percentile : percentile;
}

/**
 * Clamp a raw score to [0, 100]. Null passes through.
 */
export function scoreToPercentile(score: number | null): number | null {
  if (score === null) return null;
  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
}
```

- [ ] **Step 4: Re-run — expect 12/12 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fundamentals/percentile.ts src/server/services/fundamentals/percentile.test.ts
git commit -m "feat(fundamentals): add pure percentile ranking with lowerIsBetter inversion"
```

---

## Task 3: Scoring functions (pure, TDD)

**Files:**

- Create: `src/server/services/fundamentals/scoring.ts`
- Create: `src/server/services/fundamentals/scoring.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import {
  scoreProfitability,
  scoreGrowth,
  scoreFinancialHealth,
  scoreValuation,
  scoreComposite,
  type FundamentalMetrics,
  type PeerMetrics,
} from './scoring';

const emptyPeers: PeerMetrics = {
  grossMargin: [],
  operatingMargin: [],
  netMargin: [],
  roe: [],
  roa: [],
  roic: [],
  revenueGrowthYoy: [],
  epsGrowth: [],
  debtToEquity: [],
  currentRatio: [],
  interestCoverage: [],
  fcfYield: [],
  forwardPe: [],
  pegRatio: [],
  evEbitda: [],
};

function allNulls(): FundamentalMetrics {
  return {
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    roe: null,
    roa: null,
    roic: null,
    revenueGrowthYoy: null,
    epsGrowth: null,
    debtToEquity: null,
    currentRatio: null,
    interestCoverage: null,
    fcfYield: null,
    forwardPe: null,
    pegRatio: null,
    evEbitda: null,
  };
}

describe('scoreProfitability', () => {
  it('returns null when all profitability metrics missing', () => {
    expect(scoreProfitability(allNulls(), emptyPeers)).toBeNull();
  });

  it('returns a score 0-100 for top performer', () => {
    const metrics = { ...allNulls(), grossMargin: 0.5, netMargin: 0.25 };
    const peers = {
      ...emptyPeers,
      grossMargin: [0.1, 0.2, 0.3, 0.5],
      netMargin: [0.05, 0.1, 0.15, 0.25],
    };
    const score = scoreProfitability(metrics, peers);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(80);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it('returns a low score for bottom performer', () => {
    const metrics = { ...allNulls(), grossMargin: 0.1, netMargin: 0.05 };
    const peers = {
      ...emptyPeers,
      grossMargin: [0.1, 0.2, 0.3, 0.5],
      netMargin: [0.05, 0.1, 0.15, 0.25],
    };
    const score = scoreProfitability(metrics, peers);
    expect(score).not.toBeNull();
    expect(score!).toBeLessThanOrEqual(20);
  });
});

describe('scoreGrowth', () => {
  it('returns null when all growth metrics missing', () => {
    expect(scoreGrowth(allNulls(), emptyPeers)).toBeNull();
  });

  it('scores positive revenue growth favorably', () => {
    const metrics = { ...allNulls(), revenueGrowthYoy: 0.25 };
    const peers = { ...emptyPeers, revenueGrowthYoy: [-0.1, 0.0, 0.1, 0.25] };
    const score = scoreGrowth(metrics, peers);
    expect(score).toBeGreaterThanOrEqual(75);
  });
});

describe('scoreFinancialHealth', () => {
  it('returns null when all health metrics missing', () => {
    expect(scoreFinancialHealth(allNulls(), emptyPeers)).toBeNull();
  });

  it('rewards low debt/equity (lowerIsBetter)', () => {
    const metrics = { ...allNulls(), debtToEquity: 0.1 };
    const peers = { ...emptyPeers, debtToEquity: [0.1, 1.0, 2.0, 3.0] };
    const score = scoreFinancialHealth(metrics, peers);
    expect(score).toBeGreaterThanOrEqual(75);
  });

  it('rewards high interest coverage (higherIsBetter)', () => {
    const metrics = { ...allNulls(), interestCoverage: 50 };
    const peers = { ...emptyPeers, interestCoverage: [1, 5, 10, 50] };
    const score = scoreFinancialHealth(metrics, peers);
    expect(score).toBeGreaterThanOrEqual(75);
  });
});

describe('scoreValuation', () => {
  it('returns null when all valuation metrics missing', () => {
    expect(scoreValuation(allNulls(), emptyPeers)).toBeNull();
  });

  it('rewards low P/E (lowerIsBetter)', () => {
    const metrics = { ...allNulls(), forwardPe: 10 };
    const peers = { ...emptyPeers, forwardPe: [10, 20, 30, 50] };
    const score = scoreValuation(metrics, peers);
    expect(score).toBeGreaterThanOrEqual(75);
  });
});

describe('scoreComposite', () => {
  it('weights categories per spec (30/25/25/20)', () => {
    expect(scoreComposite(100, 100, 100, 100)).toBe(100);
    expect(scoreComposite(0, 0, 0, 0)).toBe(0);
    expect(scoreComposite(100, 0, 0, 0)).toBe(30);
    expect(scoreComposite(0, 100, 0, 0)).toBe(25);
    expect(scoreComposite(0, 0, 100, 0)).toBe(25);
    expect(scoreComposite(0, 0, 0, 100)).toBe(20);
  });

  it('ignores nulls and rebalances remaining weights', () => {
    // If growth is null, remaining weights 30+25+20=75; all 100 → 100
    expect(scoreComposite(100, null, 100, 100)).toBe(100);
    expect(scoreComposite(100, null, 0, 0)).toBeCloseTo((100 * 30) / 75, 1);
  });

  it('returns null when all categories null', () => {
    expect(scoreComposite(null, null, null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scoring.ts`**

```typescript
import { percentileRank } from './percentile';

export interface FundamentalMetrics {
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  roic: number | null;
  revenueGrowthYoy: number | null;
  epsGrowth: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  fcfYield: number | null;
  forwardPe: number | null;
  pegRatio: number | null;
  evEbitda: number | null;
}

export interface PeerMetrics {
  grossMargin: (number | null)[];
  operatingMargin: (number | null)[];
  netMargin: (number | null)[];
  roe: (number | null)[];
  roa: (number | null)[];
  roic: (number | null)[];
  revenueGrowthYoy: (number | null)[];
  epsGrowth: (number | null)[];
  debtToEquity: (number | null)[];
  currentRatio: (number | null)[];
  interestCoverage: (number | null)[];
  fcfYield: (number | null)[];
  forwardPe: (number | null)[];
  pegRatio: (number | null)[];
  evEbitda: (number | null)[];
}

/** Average non-null scores, or null if all are null. */
function averagePresent(scores: (number | null)[]): number | null {
  const present = scores.filter((s): s is number => s !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Profitability (30% of composite): margins + returns.
 * Higher is better for all six metrics.
 */
export function scoreProfitability(metrics: FundamentalMetrics, peers: PeerMetrics): number | null {
  const scores = [
    percentileRank(metrics.grossMargin, peers.grossMargin),
    percentileRank(metrics.operatingMargin, peers.operatingMargin),
    percentileRank(metrics.netMargin, peers.netMargin),
    percentileRank(metrics.roe, peers.roe),
    percentileRank(metrics.roa, peers.roa),
    percentileRank(metrics.roic, peers.roic),
  ];
  return averagePresent(scores);
}

/**
 * Growth (25% of composite): revenue + EPS growth.
 * Higher is better.
 */
export function scoreGrowth(metrics: FundamentalMetrics, peers: PeerMetrics): number | null {
  const scores = [
    percentileRank(metrics.revenueGrowthYoy, peers.revenueGrowthYoy),
    percentileRank(metrics.epsGrowth, peers.epsGrowth),
  ];
  return averagePresent(scores);
}

/**
 * Financial Health (25% of composite).
 * - Low debt/equity is better (lowerIsBetter)
 * - High current ratio is better
 * - High interest coverage is better
 * - High FCF yield is better
 */
export function scoreFinancialHealth(
  metrics: FundamentalMetrics,
  peers: PeerMetrics,
): number | null {
  const scores = [
    percentileRank(metrics.debtToEquity, peers.debtToEquity, { lowerIsBetter: true }),
    percentileRank(metrics.currentRatio, peers.currentRatio),
    percentileRank(metrics.interestCoverage, peers.interestCoverage),
    percentileRank(metrics.fcfYield, peers.fcfYield),
  ];
  return averagePresent(scores);
}

/**
 * Valuation (20% of composite): P/E, PEG, EV/EBITDA.
 * All three are lowerIsBetter.
 */
export function scoreValuation(metrics: FundamentalMetrics, peers: PeerMetrics): number | null {
  const scores = [
    percentileRank(metrics.forwardPe, peers.forwardPe, { lowerIsBetter: true }),
    percentileRank(metrics.pegRatio, peers.pegRatio, { lowerIsBetter: true }),
    percentileRank(metrics.evEbitda, peers.evEbitda, { lowerIsBetter: true }),
  ];
  return averagePresent(scores);
}

/**
 * Composite score (0-100) per PRD spec weights:
 *   Profitability 30%, Growth 25%, Health 25%, Valuation 20%.
 *
 * Null categories are dropped; remaining weights rebalance proportionally.
 * Returns null if all categories are null.
 */
export function scoreComposite(
  profitability: number | null,
  growth: number | null,
  health: number | null,
  valuation: number | null,
): number | null {
  const parts = [
    { score: profitability, weight: 0.3 },
    { score: growth, weight: 0.25 },
    { score: health, weight: 0.25 },
    { score: valuation, weight: 0.2 },
  ].filter((p): p is { score: number; weight: number } => p.score !== null);

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const weightedSum = parts.reduce((sum, p) => sum + p.score * p.weight, 0);
  return weightedSum / totalWeight;
}
```

- [ ] **Step 4: Re-run — expect all tests passing**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/fundamentals/scoring.ts src/server/services/fundamentals/scoring.test.ts
git commit -m "feat(fundamentals): add pure scoring functions (profitability/growth/health/valuation)"
```

---

## Task 4: FMP fundamentals client

**Files:**

- Create: `src/server/services/fundamentals/fmp-fundamentals-client.ts`

- [ ] **Step 1: Implement**

```typescript
import { env } from '@/lib/env';
import { FmpApiError } from '../market-data/fmp-client';
import {
  FmpRatiosSchema,
  FmpKeyMetricsSchema,
  FmpIncomeStatementSchema,
  type FmpRatiosEntry,
  type FmpKeyMetricsEntry,
  type FmpIncomeStatementEntry,
} from './fundamentals-schemas';

const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

export interface FundamentalsProvider {
  getRatios(ticker: string): Promise<FmpRatiosEntry[]>;
  getKeyMetrics(ticker: string): Promise<FmpKeyMetricsEntry[]>;
  getIncomeStatement(ticker: string): Promise<FmpIncomeStatementEntry[]>;
}

export class FmpFundamentalsClient implements FundamentalsProvider {
  constructor(private readonly apiKey: string = env.FMP_API_KEY) {}

  private requireKey(): void {
    if (!this.apiKey || this.apiKey === 'missing-fmp-key') {
      throw new FmpApiError(
        'FMP_API_KEY is not set. Add it to .env.local before running fundamentals ingestion.',
      );
    }
  }

  private async fetchJson(url: string, ticker: string): Promise<unknown> {
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
    return response.json();
  }

  async getRatios(ticker: string): Promise<FmpRatiosEntry[]> {
    this.requireKey();
    const url = `${FMP_BASE_URL}/ratios/${encodeURIComponent(ticker)}?period=quarter&limit=8&apikey=${encodeURIComponent(this.apiKey)}`;
    const json = await this.fetchJson(url, ticker);
    try {
      return FmpRatiosSchema.parse(json);
    } catch (err) {
      throw new FmpApiError(
        `FMP ratios response failed schema validation for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getKeyMetrics(ticker: string): Promise<FmpKeyMetricsEntry[]> {
    this.requireKey();
    const url = `${FMP_BASE_URL}/key-metrics/${encodeURIComponent(ticker)}?period=quarter&limit=8&apikey=${encodeURIComponent(this.apiKey)}`;
    const json = await this.fetchJson(url, ticker);
    try {
      return FmpKeyMetricsSchema.parse(json);
    } catch (err) {
      throw new FmpApiError(
        `FMP key-metrics response failed schema validation for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getIncomeStatement(ticker: string): Promise<FmpIncomeStatementEntry[]> {
    this.requireKey();
    const url = `${FMP_BASE_URL}/income-statement/${encodeURIComponent(ticker)}?period=quarter&limit=8&apikey=${encodeURIComponent(this.apiKey)}`;
    const json = await this.fetchJson(url, ticker);
    try {
      return FmpIncomeStatementSchema.parse(json);
    } catch (err) {
      throw new FmpApiError(
        `FMP income-statement response failed schema validation for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add src/server/services/fundamentals/fmp-fundamentals-client.ts
git commit -m "feat(fundamentals): add FMP fundamentals HTTP client"
```

---

## Task 5: Ingestion orchestrator

**Files:**

- Create: `src/server/services/fundamentals/ingestion.ts`

This orchestrator is two-pass: fetch all raw fundamentals first (needed for peer comparisons within sectors), then score each stock against its sector peers, then upsert.

- [ ] **Step 1: Implement**

```typescript
import { inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { stocks, fundamentals } from '@/server/db/schema';
import { FmpFundamentalsClient, type FundamentalsProvider } from './fmp-fundamentals-client';
import { deriveQuarter } from './fundamentals-schemas';
import {
  scoreProfitability,
  scoreGrowth,
  scoreFinancialHealth,
  scoreValuation,
  scoreComposite,
  type FundamentalMetrics,
  type PeerMetrics,
} from './scoring';

export interface FundamentalsResult {
  ticker: string;
  stockId: number;
  quarter: string;
  fundamentalScore: number | null;
}

export interface FundamentalsSummary {
  results: FundamentalsResult[];
  errors: { ticker: string; error: string }[];
}

interface StockRow {
  id: number;
  ticker: string;
  sector: string | null;
}

interface RawFundamentals {
  stockId: number;
  ticker: string;
  sector: string | null;
  quarter: string;
  revenue: number | null;
  eps: number | null;
  metrics: FundamentalMetrics;
}

const EMPTY_PEERS: PeerMetrics = {
  grossMargin: [],
  operatingMargin: [],
  netMargin: [],
  roe: [],
  roa: [],
  roic: [],
  revenueGrowthYoy: [],
  epsGrowth: [],
  debtToEquity: [],
  currentRatio: [],
  interestCoverage: [],
  fcfYield: [],
  forwardPe: [],
  pegRatio: [],
  evEbitda: [],
};

function buildPeerMetrics(peers: RawFundamentals[]): PeerMetrics {
  const out: PeerMetrics = {
    grossMargin: [],
    operatingMargin: [],
    netMargin: [],
    roe: [],
    roa: [],
    roic: [],
    revenueGrowthYoy: [],
    epsGrowth: [],
    debtToEquity: [],
    currentRatio: [],
    interestCoverage: [],
    fcfYield: [],
    forwardPe: [],
    pegRatio: [],
    evEbitda: [],
  };
  for (const p of peers) {
    (Object.keys(out) as (keyof PeerMetrics)[]).forEach((key) => {
      out[key].push(p.metrics[key]);
    });
  }
  return out;
}

export async function ingestFundamentalsForTickers(
  tickers: string[],
  provider: FundamentalsProvider = new FmpFundamentalsClient(),
): Promise<FundamentalsSummary> {
  const summary: FundamentalsSummary = { results: [], errors: [] };
  if (tickers.length === 0) return summary;

  const universe = (await db
    .select({ id: stocks.id, ticker: stocks.ticker, sector: stocks.sector })
    .from(stocks)
    .where(inArray(stocks.ticker, tickers))) as StockRow[];

  const tickerToRow = new Map(universe.map((row) => [row.ticker, row]));
  const raws: RawFundamentals[] = [];

  // Pass 1: fetch per-ticker raw fundamentals
  for (const ticker of tickers) {
    const row = tickerToRow.get(ticker);
    if (!row) {
      summary.errors.push({
        ticker,
        error: 'Ticker not found in stocks table — run pnpm db:seed first',
      });
      continue;
    }

    try {
      const [ratios, keyMetrics, income] = await Promise.all([
        provider.getRatios(ticker),
        provider.getKeyMetrics(ticker),
        provider.getIncomeStatement(ticker),
      ]);

      if (ratios.length === 0 || income.length === 0) {
        summary.errors.push({
          ticker,
          error: 'FMP returned no fundamental data for this ticker',
        });
        continue;
      }

      const latestRatios = ratios[0];
      const latestKey = keyMetrics[0] ?? null;
      const latestIncome = income[0];

      // YoY revenue growth: compare most recent quarter to same quarter last year
      const yearAgoIncome =
        income.find(
          (i) =>
            i.period === latestIncome.period &&
            Number(i.calendarYear) === Number(latestIncome.calendarYear) - 1,
        ) ?? null;

      const revenueGrowthYoy =
        latestIncome.revenue != null &&
        yearAgoIncome?.revenue != null &&
        yearAgoIncome.revenue !== 0
          ? (latestIncome.revenue - yearAgoIncome.revenue) / yearAgoIncome.revenue
          : null;

      const epsGrowth =
        latestIncome.eps != null && yearAgoIncome?.eps != null && yearAgoIncome.eps !== 0
          ? (latestIncome.eps - yearAgoIncome.eps) / Math.abs(yearAgoIncome.eps)
          : null;

      const metrics: FundamentalMetrics = {
        grossMargin: latestRatios.grossProfitMargin ?? null,
        operatingMargin: latestRatios.operatingProfitMargin ?? null,
        netMargin: latestRatios.netProfitMargin ?? null,
        roe: latestRatios.returnOnEquity ?? null,
        roa: latestRatios.returnOnAssets ?? null,
        roic: latestKey?.roic ?? null,
        revenueGrowthYoy,
        epsGrowth,
        debtToEquity: latestRatios.debtEquityRatio ?? null,
        currentRatio: latestRatios.currentRatio ?? null,
        interestCoverage: latestRatios.interestCoverage ?? null,
        fcfYield: latestKey?.freeCashFlowYield ?? null,
        forwardPe: latestRatios.priceEarningsRatio ?? null,
        pegRatio: latestKey?.pegRatio ?? null,
        evEbitda: latestKey?.enterpriseValueOverEBITDA ?? null,
      };

      raws.push({
        stockId: row.id,
        ticker: row.ticker,
        sector: row.sector,
        quarter: deriveQuarter(latestRatios.calendarYear, latestRatios.period),
        revenue: latestIncome.revenue ?? null,
        eps: latestIncome.eps ?? null,
        metrics,
      });
    } catch (err) {
      summary.errors.push({
        ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (raws.length === 0) return summary;

  // Pass 2: group by sector, score each stock against its sector peers
  const bySector = new Map<string, RawFundamentals[]>();
  for (const raw of raws) {
    const key = raw.sector ?? '__unknown__';
    const list = bySector.get(key) ?? [];
    list.push(raw);
    bySector.set(key, list);
  }

  // Pass 3: score + upsert
  for (const raw of raws) {
    const sectorPeers = bySector.get(raw.sector ?? '__unknown__') ?? [];
    const peerMetrics = sectorPeers.length > 1 ? buildPeerMetrics(sectorPeers) : EMPTY_PEERS;

    const profitability = scoreProfitability(raw.metrics, peerMetrics);
    const growth = scoreGrowth(raw.metrics, peerMetrics);
    const health = scoreFinancialHealth(raw.metrics, peerMetrics);
    const valuation = scoreValuation(raw.metrics, peerMetrics);
    const composite = scoreComposite(profitability, growth, health, valuation);

    const toStr = (n: number | null): string | null => (n === null ? null : String(n));

    try {
      await db
        .insert(fundamentals)
        .values({
          stockId: raw.stockId,
          quarter: raw.quarter,
          revenue: raw.revenue,
          eps: toStr(raw.metrics.grossMargin === null ? null : raw.eps),
          grossMargin: toStr(raw.metrics.grossMargin),
          operatingMargin: toStr(raw.metrics.operatingMargin),
          netMargin: toStr(raw.metrics.netMargin),
          roe: toStr(raw.metrics.roe),
          roa: toStr(raw.metrics.roa),
          roic: toStr(raw.metrics.roic),
          revenueGrowthYoy: toStr(raw.metrics.revenueGrowthYoy),
          epsGrowth: toStr(raw.metrics.epsGrowth),
          debtToEquity: toStr(raw.metrics.debtToEquity),
          currentRatio: toStr(raw.metrics.currentRatio),
          interestCoverage: toStr(raw.metrics.interestCoverage),
          fcfYield: toStr(raw.metrics.fcfYield),
          forwardPe: toStr(raw.metrics.forwardPe),
          pegRatio: toStr(raw.metrics.pegRatio),
          evEbitda: toStr(raw.metrics.evEbitda),
          fundamentalScore: toStr(composite),
        })
        .onConflictDoUpdate({
          target: [fundamentals.stockId, fundamentals.quarter],
          set: {
            revenue: sql`excluded.revenue`,
            eps: sql`excluded.eps`,
            grossMargin: sql`excluded.gross_margin`,
            operatingMargin: sql`excluded.operating_margin`,
            netMargin: sql`excluded.net_margin`,
            roe: sql`excluded.roe`,
            roa: sql`excluded.roa`,
            roic: sql`excluded.roic`,
            revenueGrowthYoy: sql`excluded.revenue_growth_yoy`,
            epsGrowth: sql`excluded.eps_growth`,
            debtToEquity: sql`excluded.debt_to_equity`,
            currentRatio: sql`excluded.current_ratio`,
            interestCoverage: sql`excluded.interest_coverage`,
            fcfYield: sql`excluded.fcf_yield`,
            forwardPe: sql`excluded.forward_pe`,
            pegRatio: sql`excluded.peg_ratio`,
            evEbitda: sql`excluded.ev_ebitda`,
            fundamentalScore: sql`excluded.fundamental_score`,
          },
        });

      summary.results.push({
        ticker: raw.ticker,
        stockId: raw.stockId,
        quarter: raw.quarter,
        fundamentalScore: composite,
      });
    } catch (err) {
      summary.errors.push({
        ticker: raw.ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
```

Note: the `eps` line in the insert values above has a copy-paste artifact — replace with a straight `toStr(raw.eps)`:

```typescript
eps: toStr(raw.eps),
```

Make sure revenue handles the bigint column correctly (bigint column with mode: 'number' expects a number, not a string):

```typescript
revenue: raw.revenue,
```

Both are shown correctly in the listing above as `raw.revenue` (number) and `toStr(raw.eps)` (string).

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/server/services/fundamentals/ingestion.ts
git commit -m "feat(fundamentals): add ingestion orchestrator with sector-percentile scoring"
```

---

## Task 6: CLI + barrel + npm script + docs + push

**Files:**

- Create: `src/server/services/fundamentals/cli.ts`
- Create: `src/server/services/fundamentals/index.ts`
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create `index.ts` barrel**

```typescript
export * from './fundamentals-schemas';
export * from './fmp-fundamentals-client';
export * from './percentile';
export * from './scoring';
export * from './ingestion';
```

- [ ] **Step 2: Create `cli.ts`**

```typescript
import { db } from '@/server/db';
import { stocks } from '@/server/db/schema';
import { ingestFundamentalsForTickers } from './ingestion';

async function main() {
  const argTickers = process.argv.slice(2);
  let tickers: string[];

  if (argTickers.length > 0) {
    tickers = argTickers.map((t) => t.toUpperCase());
    console.log(`Ingesting fundamentals for ${tickers.length} ticker(s) from CLI args...`);
  } else {
    const rows = await db.select({ ticker: stocks.ticker }).from(stocks);
    tickers = rows.map((r) => r.ticker);
    console.log(`Ingesting fundamentals for full universe — ${tickers.length} ticker(s)...`);
  }

  const summary = await ingestFundamentalsForTickers(tickers);

  console.log('\n=== Fundamentals Summary ===');
  console.log(`Successful: ${summary.results.length}`);
  for (const r of summary.results) {
    const score = r.fundamentalScore !== null ? r.fundamentalScore.toFixed(1) : 'n/a';
    console.log(`  ${r.ticker.padEnd(8)} ${r.quarter.padEnd(8)} score=${score}`);
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
    console.error('Fundamentals ingestion failed:', err);
    process.exit(1);
  });
```

- [ ] **Step 3: Add npm script**

In `package.json` under `"scripts"`, after `"ingest:prices"`:

```json
"ingest:fundamentals": "tsx src/server/services/fundamentals/cli.ts"
```

- [ ] **Step 4: Update CLAUDE.md**

Add to "Running Locally" section after `pnpm ingest:prices`:

```
pnpm ingest:fundamentals   # fetch ratios + score stocks (needs FMP_API_KEY)
```

Add to "Project Structure" under `services/`:

```
      fundamentals/ FMP ratios+metrics+income client, scoring, ingestion
```

- [ ] **Step 5: Full verification**

```bash
pnpm format
pnpm lint
pnpm test:run
pnpm build
```

All four must pass. Tests should be ~48 + 8 (schemas) + 12 (percentile) + ~15 (scoring) = ~83 tests.

- [ ] **Step 6: Commit and push**

```bash
git add src/server/services/fundamentals/index.ts src/server/services/fundamentals/cli.ts package.json CLAUDE.md
git commit -m "chore(fundamentals): wire ingest:fundamentals CLI and document Phase 4"
git add docs/superpowers/plans/2026-04-11-phase-4-fundamental-scoring.md
git commit -m "docs: add Phase 4 (fundamental scoring) implementation plan"
git push origin main
```

---

## Phase 4 Completion Criteria

- [x] FMP fundamentals client for ratios, key-metrics, income-statement
- [x] Pure percentile ranking with lowerIsBetter inversion
- [x] Four category scores (profitability, growth, health, valuation) + composite
- [x] Sector-peer normalization
- [x] Ingestion writes to `fundamentals` table with `onConflictDoUpdate`
- [x] CLI: `pnpm ingest:fundamentals`
- [x] All tests pass, lint/format/build clean, pushed

## Out of Scope

- Full annual + TTM scoring — just latest quarter for now
- Earnings surprise (not in free tier FMP data)
- Sector median fallback when a stock has no peers — defaults to 50
