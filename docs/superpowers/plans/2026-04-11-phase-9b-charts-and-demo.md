# Phase 9b: Charts + Public Demo Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Lightweight Charts price+MA200+signal-marker chart to the stock detail page, and ship a public `/demo` sandbox with synthetic fixture data so the app can be browsed locally without Neon/Clerk/FMP/Anthropic credentials.

**Architecture:**

- **Chart component:** Thin client wrapper around `lightweight-charts@5` (v5 uses the new `addSeries(CandlestickSeries, ...)` API). The component receives already-shaped `{ time, open, high, low, close }` bars + optional `maSeries` + `markers`. All data-shaping is done server-side in pure helpers (tested).
- **Data path (real):** New `signals.priceHistory({ ticker, days })` tRPC query joins `dailyPrices` + `signals` for the stock, returns `{ bars, maSeries, markers }`. Chart is embedded in `/stock/[ticker]` above the rationale card.
- **Data path (demo):** Synthetic fixtures live under `src/lib/demo/fixtures.ts`. A deterministic generator produces OHLCV + MA200 series from a seed so the chart looks realistic. The `/demo` route group reads from fixtures directly (no DB, no tRPC), rendering the same `SignalCard`, `RationaleCard`, and `StockChart` components as the real app. Middleware marks `/demo/*` public.
- **Isolation:** The "no mock data" project rule is honored — production routes (`/dashboard`, `/stock/[ticker]`) stay DB-backed. Demo fixtures never leak into production queries. Every demo page carries a visible "Demo mode — synthetic data" banner.

**Tech Stack:** Next.js 16 App Router, React 19, tRPC v11, Drizzle 0.45, `lightweight-charts@5.1.0`, Tailwind v4, shadcn base-nova, Vitest.

**Scope (in):**

- `lightweight-charts@5.1.0` dependency
- Pure helpers: `transformPriceHistoryRows`, `buildChartMarkersFromSignals`, `generateSyntheticSeries` — all tested
- `signals.priceHistory` tRPC query
- `<StockChart />` client component
- Demo sandbox: `/demo`, `/demo/signals`, `/demo/stock/[ticker]`, fixture data
- Middleware update to allow `/demo/*`
- Landing page CTA: "Try the demo"
- `DemoBanner` component on every demo page
- CLAUDE.md update (Phase 9b structure)

**Scope (out):**

- No mutations (still read-only)
- No watchlist (Phase 10)
- No trade log (Phase 11)
- No real backtesting (Phase 12)
- No volume histogram overlay (chart is price + MA200 + signal markers only)
- No intraday data — daily candles only

---

## File Structure

**New files:**

- `src/lib/demo/fixtures.ts` — three synthetic stocks with full signal/rationale/price history, built by calling `generateSyntheticSeries`
- `src/lib/demo/generate.ts` — `generateSyntheticSeries(seed, days)` deterministic OHLCV + MA200 generator
- `src/lib/demo/generate.test.ts` — tests for generator determinism and shape
- `src/components/charts/stock-chart.tsx` — `'use client'` chart component
- `src/components/charts/chart-data.ts` — pure helpers `transformPriceHistoryRows`, `buildChartMarkersFromSignals` + types
- `src/components/charts/chart-data.test.ts` — tests for the helpers
- `src/components/demo/demo-banner.tsx` — visible "demo mode" banner
- `src/app/demo/layout.tsx` — public layout with SiteNav + DemoBanner, no auth wrapper
- `src/app/demo/page.tsx` — redirect to `/demo/signals`
- `src/app/demo/signals/page.tsx` — synthetic signals list
- `src/app/demo/stock/[ticker]/page.tsx` — synthetic stock detail with chart

**Modified files:**

- `package.json` — add `lightweight-charts@^5.1.0`
- `src/server/trpc/routers/signals.ts` — add `priceHistory` procedure + `PriceHistoryJoinRow` type + `transformPriceHistoryRows` re-export
- `src/server/trpc/routers/signals.test.ts` — add tests for `transformPriceHistoryRows` (or delegate to chart-data.test.ts)
- `src/app/(auth)/stock/[ticker]/page.tsx` — embed `<StockChart />` above the RationaleCard
- `src/app/page.tsx` / `src/components/landing/hero.tsx` — add "Try the demo" CTA linking to `/demo`
- `middleware.ts` — currently `isProtectedRoute` already excludes `/demo` implicitly (not in matcher), but verify and add explicit comment
- `CLAUDE.md` — Phase 9b section under Project Structure

---

## Task 1: Install `lightweight-charts`

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install dependency**

```bash
pnpm add lightweight-charts@^5.1.0
```

- [ ] **Step 2: Verify install**

Run: `pnpm list lightweight-charts`
Expected: `lightweight-charts 5.1.0` or higher

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add lightweight-charts v5 for price charts"
```

---

## Task 2: Pure chart-data helpers (TDD)

**Files:**

- Create: `src/components/charts/chart-data.ts`
- Test: `src/components/charts/chart-data.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/charts/chart-data.test.ts
import { describe, it, expect } from 'vitest';
import {
  transformPriceHistoryRows,
  buildChartMarkersFromSignals,
  type PriceHistoryRow,
} from './chart-data';

describe('transformPriceHistoryRows', () => {
  it('converts drizzle numeric strings to chart bars sorted ascending by date', () => {
    const rows: PriceHistoryRow[] = [
      {
        date: '2026-01-03',
        open: '100.00',
        high: '102.50',
        low: '99.75',
        close: '101.25',
        volume: 1_200_000,
        ma200: '98.50',
      },
      {
        date: '2026-01-02',
        open: '99.00',
        high: '101.00',
        low: '98.50',
        close: '100.00',
        volume: 900_000,
        ma200: '98.30',
      },
    ];

    const out = transformPriceHistoryRows(rows);

    expect(out.bars).toHaveLength(2);
    expect(out.bars[0].time).toBe('2026-01-02');
    expect(out.bars[0].open).toBe(99);
    expect(out.bars[0].high).toBe(101);
    expect(out.bars[0].low).toBe(98.5);
    expect(out.bars[0].close).toBe(100);
    expect(out.bars[1].time).toBe('2026-01-03');
    expect(out.ma200Series).toHaveLength(2);
    expect(out.ma200Series[0]).toEqual({ time: '2026-01-02', value: 98.3 });
    expect(out.ma200Series[1]).toEqual({ time: '2026-01-03', value: 98.5 });
  });

  it('skips null ma200 values in the ma200 series but keeps the bar', () => {
    const rows: PriceHistoryRow[] = [
      {
        date: '2026-01-02',
        open: '99.00',
        high: '101.00',
        low: '98.50',
        close: '100.00',
        volume: 900_000,
        ma200: null,
      },
      {
        date: '2026-01-03',
        open: '100.00',
        high: '102.50',
        low: '99.75',
        close: '101.25',
        volume: 1_200_000,
        ma200: '98.50',
      },
    ];
    const out = transformPriceHistoryRows(rows);
    expect(out.bars).toHaveLength(2);
    expect(out.ma200Series).toHaveLength(1);
    expect(out.ma200Series[0]).toEqual({ time: '2026-01-03', value: 98.5 });
  });
});

describe('buildChartMarkersFromSignals', () => {
  it('creates a marker per signal with a label derived from the signal type', () => {
    const markers = buildChartMarkersFromSignals([
      { signalType: 'SIG-02', triggeredAt: new Date('2026-01-05T14:30:00Z'), strength: 'strong' },
      { signalType: 'SIG-04', triggeredAt: new Date('2026-02-10T14:30:00Z'), strength: 'medium' },
    ]);

    expect(markers).toHaveLength(2);
    expect(markers[0].time).toBe('2026-01-05');
    expect(markers[0].position).toBe('belowBar');
    expect(markers[0].shape).toBe('arrowUp');
    expect(markers[0].text).toContain('SIG-02');
    expect(markers[1].time).toBe('2026-02-10');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/components/charts/chart-data.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/components/charts/chart-data.ts

export interface PriceHistoryRow {
  date: string; // ISO date YYYY-MM-DD
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
  ma200: string | null;
}

export interface ChartBar {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLinePoint {
  time: string;
  value: number;
}

export interface ChartMarker {
  time: string;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text: string;
}

export interface ChartData {
  bars: ChartBar[];
  ma200Series: ChartLinePoint[];
}

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function transformPriceHistoryRows(rows: PriceHistoryRow[]): ChartData {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const bars: ChartBar[] = sorted.map((r) => ({
    time: r.date,
    open: toNumber(r.open),
    high: toNumber(r.high),
    low: toNumber(r.low),
    close: toNumber(r.close),
  }));
  const ma200Series: ChartLinePoint[] = sorted
    .filter((r) => r.ma200 !== null)
    .map((r) => ({ time: r.date, value: toNumber(r.ma200 as string) }));
  return { bars, ma200Series };
}

export interface SignalForMarker {
  signalType: string;
  triggeredAt: Date;
  strength: string;
}

export function buildChartMarkersFromSignals(signals: SignalForMarker[]): ChartMarker[] {
  return signals.map((s) => {
    const color =
      s.strength === 'very_strong' ? '#16a34a' : s.strength === 'strong' ? '#22c55e' : '#3b82f6';
    return {
      time: s.triggeredAt.toISOString().slice(0, 10),
      position: 'belowBar',
      shape: 'arrowUp',
      color,
      text: s.signalType,
    };
  });
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm test:run src/components/charts/chart-data.test.ts`
Expected: PASS (2 tests in `transformPriceHistoryRows`, 1 in `buildChartMarkersFromSignals`)

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/chart-data.ts src/components/charts/chart-data.test.ts
git commit -m "feat(charts): add pure chart-data helpers with markers"
```

---

## Task 3: Synthetic series generator (TDD)

**Files:**

- Create: `src/lib/demo/generate.ts`
- Test: `src/lib/demo/generate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/demo/generate.test.ts
import { describe, it, expect } from 'vitest';
import { generateSyntheticSeries } from './generate';

describe('generateSyntheticSeries', () => {
  it('produces a deterministic OHLCV series for a given seed', () => {
    const a = generateSyntheticSeries({
      seed: 42,
      days: 250,
      startPrice: 100,
      endDate: '2026-04-10',
    });
    const b = generateSyntheticSeries({
      seed: 42,
      days: 250,
      startPrice: 100,
      endDate: '2026-04-10',
    });

    expect(a.length).toBe(250);
    expect(b.length).toBe(250);
    expect(a[0]).toEqual(b[0]);
    expect(a[249]).toEqual(b[249]);
    // last date equals endDate
    expect(a[249].date).toBe('2026-04-10');
  });

  it('computes ma200 only after 200 bars are available', () => {
    const rows = generateSyntheticSeries({
      seed: 7,
      days: 250,
      startPrice: 50,
      endDate: '2026-04-10',
    });
    expect(rows[0].ma200).toBeNull();
    expect(rows[198].ma200).toBeNull();
    expect(rows[199].ma200).not.toBeNull();
    expect(rows[249].ma200).not.toBeNull();
  });

  it('each row has valid OHLC relationships', () => {
    const rows = generateSyntheticSeries({
      seed: 3,
      days: 50,
      startPrice: 25,
      endDate: '2026-04-10',
    });
    for (const r of rows) {
      const o = Number(r.open);
      const h = Number(r.high);
      const l = Number(r.low);
      const c = Number(r.close);
      expect(h).toBeGreaterThanOrEqual(Math.max(o, c));
      expect(l).toBeLessThanOrEqual(Math.min(o, c));
      expect(l).toBeGreaterThan(0);
      expect(r.volume).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/lib/demo/generate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/demo/generate.ts
import type { PriceHistoryRow } from '@/components/charts/chart-data';

// Mulberry32 deterministic PRNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

interface GenerateOptions {
  seed: number;
  days: number;
  startPrice: number;
  /** Inclusive end date (YYYY-MM-DD). The last row lands exactly on this date. */
  endDate: string;
}

export function generateSyntheticSeries(opts: GenerateOptions): PriceHistoryRow[] {
  const { seed, days, startPrice, endDate } = opts;
  const rng = mulberry32(seed);
  const end = new Date(`${endDate}T00:00:00Z`);
  const rows: PriceHistoryRow[] = [];
  let price = startPrice;

  // Generate closes first so we can compute MA200 cleanly.
  const closes: number[] = [];
  for (let i = 0; i < days; i++) {
    const drift = 0.0003; // slight upward bias
    const vol = 0.018; // daily vol
    const shock = (rng() - 0.5) * 2 * vol + drift;
    price = Math.max(1, price * (1 + shock));
    closes.push(price);
  }

  for (let i = 0; i < days; i++) {
    const date = isoDate(addDays(end, -(days - 1 - i)));
    const close = closes[i];
    const open = i === 0 ? startPrice : closes[i - 1];
    const wiggleHi = 1 + rng() * 0.015;
    const wiggleLo = 1 - rng() * 0.015;
    const high = Math.max(open, close) * wiggleHi;
    const low = Math.min(open, close) * wiggleLo;
    const volume = Math.round(500_000 + rng() * 3_000_000);

    let ma200: string | null = null;
    if (i >= 199) {
      const window = closes.slice(i - 199, i + 1);
      const avg = window.reduce((s, v) => s + v, 0) / window.length;
      ma200 = avg.toFixed(4);
    }

    rows.push({
      date,
      open: open.toFixed(4),
      high: high.toFixed(4),
      low: low.toFixed(4),
      close: close.toFixed(4),
      volume,
      ma200,
    });
  }

  return rows;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test:run src/lib/demo/generate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/generate.ts src/lib/demo/generate.test.ts
git commit -m "feat(demo): add deterministic synthetic OHLCV + MA200 generator"
```

---

## Task 4: Demo fixtures

**Files:**

- Create: `src/lib/demo/fixtures.ts`

- [ ] **Step 1: Write the fixture**

```ts
// src/lib/demo/fixtures.ts
import { generateSyntheticSeries } from './generate';
import type { SignalViewModel } from '@/server/trpc/routers/signals';
import type { PriceHistoryRow } from '@/components/charts/chart-data';

export const DEMO_END_DATE = '2026-04-10';

export interface DemoStockDetail {
  stock: {
    id: number;
    ticker: string;
    name: string;
    sector: string | null;
    lastPrice: number;
  };
  signals: SignalViewModel[];
  priceHistory: PriceHistoryRow[];
  rationale: {
    summary: string;
    fundamentalThesis: string;
    technicalContext: string;
    strategyNote: string;
    confidence: string;
    disclaimer: string;
  };
}

const DISCLAIMER =
  'Demo content — synthetic data and fabricated rationale for UI preview only. Not investment advice.';

function buildStock(args: {
  id: number;
  ticker: string;
  name: string;
  sector: string;
  seed: number;
  startPrice: number;
  signalType: string;
  strength: 'medium' | 'strong' | 'very_strong';
  state: string;
  confidence: 'Low' | 'Medium' | 'High';
  summary: string;
  thesis: string;
  technical: string;
  strategy: string;
  signalScore: number;
  fundamentalScore: number;
}): DemoStockDetail {
  const priceHistory = generateSyntheticSeries({
    seed: args.seed,
    days: 260,
    startPrice: args.startPrice,
    endDate: DEMO_END_DATE,
  });
  const lastRow = priceHistory[priceHistory.length - 1];
  const lastPrice = Number(lastRow.close);
  const triggeredAt = new Date(`${lastRow.date}T14:30:00Z`);
  const signal: SignalViewModel = {
    signalId: args.id * 100 + 1,
    signalType: args.signalType,
    strength: args.strength,
    volumeConfirmed: true,
    fundamentalScore: args.fundamentalScore,
    signalScore: args.signalScore,
    triggeredAt,
    stock: {
      id: args.id,
      ticker: args.ticker,
      name: args.name,
      sector: args.sector,
      lastPrice,
    },
    recommendation: {
      state: args.state,
      targetPrice: +(lastPrice * 1.18).toFixed(2),
      stopLoss: +(lastPrice * 0.92).toFixed(2),
      trailingStop: null,
      transitionedAt: triggeredAt,
    },
    rationale: {
      summary: args.summary,
      confidence: args.confidence,
    },
  };
  return {
    stock: {
      id: args.id,
      ticker: args.ticker,
      name: args.name,
      sector: args.sector,
      lastPrice,
    },
    signals: [signal],
    priceHistory,
    rationale: {
      summary: args.summary,
      fundamentalThesis: args.thesis,
      technicalContext: args.technical,
      strategyNote: args.strategy,
      confidence: args.confidence,
      disclaimer: DISCLAIMER,
    },
  };
}

export const DEMO_STOCKS: Record<string, DemoStockDetail> = {
  NOVA: buildStock({
    id: 1,
    ticker: 'NOVA',
    name: 'Nova Semiconductor Corp.',
    sector: 'Technology',
    seed: 101,
    startPrice: 58,
    signalType: 'SIG-02',
    strength: 'very_strong',
    state: 'BUY',
    confidence: 'High',
    signalScore: 88,
    fundamentalScore: 82,
    summary:
      'Nova Semiconductor cleared its MA200 on strong volume while revenue growth stayed above 20% YoY. The setup is a textbook post-consolidation breakout.',
    thesis:
      'Revenue growth 24% YoY, gross margin expanding from 46% to 51%, and FCF yield firmly positive. Debt/equity below 0.3. Valuation is demanding but justified by the quality profile.',
    technical:
      'Price broke out above the MA200 after a 10-week base. Volume on breakout ran ~2.1x the 50-day average. MA200 slope turned positive four weeks ago.',
    strategy:
      'Scale in on the breakout retest. Trail a 10% stop once the position moves 15% in favor. Re-evaluate on the next earnings print.',
  }),
  AURA: buildStock({
    id: 2,
    ticker: 'AURA',
    name: 'Aura Health Systems',
    sector: 'Healthcare',
    seed: 202,
    startPrice: 120,
    signalType: 'SIG-04',
    strength: 'strong',
    state: 'HOLD',
    confidence: 'Medium',
    signalScore: 74,
    fundamentalScore: 79,
    summary:
      'Aura Health is riding a quality uptrend. The signal fired on a VCP breakout with volume confirmation but the recommendation is now HOLD pending the next fundamental update.',
    thesis:
      'Operating margin 18%, ROIC 15%, low leverage. EPS growth 12% YoY. Defensive growth profile — not spectacular but durable.',
    technical:
      'Clean VCP pattern resolved to the upside. Relative strength vs the broader market is at a 6-month high.',
    strategy:
      'Hold existing position. Do not add until either a new base forms or earnings reaffirm the growth trajectory.',
  }),
  HELIO: buildStock({
    id: 3,
    ticker: 'HELIO',
    name: 'Helio Energy Partners',
    sector: 'Energy',
    seed: 313,
    startPrice: 42,
    signalType: 'SIG-01',
    strength: 'medium',
    state: 'WATCH',
    confidence: 'Medium',
    signalScore: 62,
    fundamentalScore: 68,
    summary:
      'Helio is approaching its MA200 from below. The signal is WATCH — fundamentals are improving but the technical confirmation has not arrived yet.',
    thesis:
      'Revenue growth accelerating (8% → 14% YoY over three quarters). Margins still thin but improving. Balance sheet is clean enough to survive a downturn.',
    technical:
      'Price is within 3% of its MA200. Volume has been contracting, which is bullish ahead of a potential breakout.',
    strategy:
      'Wait for a confirmed breakout above MA200 on volume. Do not chase before confirmation.',
  }),
};

export const DEMO_SIGNAL_LIST: SignalViewModel[] = Object.values(DEMO_STOCKS).map(
  (s) => s.signals[0],
);
```

- [ ] **Step 2: Run `pnpm tsc --noEmit` to catch type errors**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/demo/fixtures.ts
git commit -m "feat(demo): add synthetic fixtures for three demo stocks"
```

---

## Task 5: `signals.priceHistory` tRPC query

**Files:**

- Modify: `src/server/trpc/routers/signals.ts`
- Test: `src/server/trpc/routers/signals.test.ts` (add a test or keep unit test in chart-data.test.ts — skip here, chart-data already covers it)

- [ ] **Step 1: Add the procedure**

Append to `src/server/trpc/routers/signals.ts` (inside the `router({ ... })` call):

```ts
  priceHistory: publicProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(10),
        days: z.number().int().min(30).max(750).default(260),
      }),
    )
    .query(async ({ input }) => {
      const ticker = input.ticker.toUpperCase();
      const [stock] = await db
        .select({ id: stocks.id, ticker: stocks.ticker })
        .from(stocks)
        .where(eq(stocks.ticker, ticker))
        .limit(1);
      if (!stock) return null;

      const rows = await db
        .select({
          date: dailyPrices.date,
          open: dailyPrices.open,
          high: dailyPrices.high,
          low: dailyPrices.low,
          close: dailyPrices.close,
          volume: dailyPrices.volume,
          ma200: dailyPrices.ma200,
        })
        .from(dailyPrices)
        .where(eq(dailyPrices.stockId, stock.id))
        .orderBy(desc(dailyPrices.date))
        .limit(input.days);

      // Re-sort ascending for chart consumption.
      const chartData = transformPriceHistoryRows(
        rows.map((r) => ({
          date: r.date,
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          volume: r.volume,
          ma200: r.ma200,
        })),
      );

      const sigRows = await db
        .select({
          signalType: signals.signalType,
          triggeredAt: signals.triggeredAt,
          strength: signals.strength,
        })
        .from(signals)
        .where(eq(signals.stockId, stock.id))
        .orderBy(desc(signals.triggeredAt));

      return {
        ticker,
        bars: chartData.bars,
        ma200Series: chartData.ma200Series,
        markers: buildChartMarkersFromSignals(
          sigRows.map((s) => ({
            signalType: s.signalType,
            triggeredAt: s.triggeredAt,
            strength: s.strength,
          })),
        ),
      };
    }),
```

Also add these imports at the top:

```ts
import { dailyPrices } from '@/server/db/schema';
import {
  transformPriceHistoryRows,
  buildChartMarkersFromSignals,
} from '@/components/charts/chart-data';
```

- [ ] **Step 2: Run tsc**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: all existing tests still pass (227+)

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/signals.ts
git commit -m "feat(trpc): add signals.priceHistory query"
```

---

## Task 6: `<StockChart />` client component

**Files:**

- Create: `src/components/charts/stock-chart.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/charts/stock-chart.tsx
'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import type { ChartBar, ChartLinePoint, ChartMarker } from './chart-data';

export interface StockChartProps {
  bars: ChartBar[];
  ma200Series: ChartLinePoint[];
  markers: ChartMarker[];
  height?: number;
}

export function StockChart({ bars, ma200Series, markers, height = 360 }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgb(120,120,130)',
      },
      grid: {
        horzLines: { color: 'rgba(120,120,130,0.15)' },
        vertLines: { color: 'rgba(120,120,130,0.07)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 6 },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });
    candleSeries.setData(
      bars.map((b) => ({
        time: b.time as Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );

    if (ma200Series.length > 0) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      lineSeries.setData(ma200Series.map((p) => ({ time: p.time as Time, value: p.value })));
    }

    if (markers.length > 0) {
      // lightweight-charts v5 markers via the series setMarkers helper
      candleSeries.setMarkers(
        markers.map((m) => ({
          time: m.time as Time,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        })),
      );
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, ma200Series, markers, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
```

- [ ] **Step 2: Verify tsc**

Run: `pnpm tsc --noEmit`
Expected: no errors.

**IF** the lightweight-charts v5 import names differ, consult `node_modules/lightweight-charts/dist/typings.d.ts` and adjust. If `setMarkers` moved to a helper, use `import { createSeriesMarkers } from 'lightweight-charts';` and `createSeriesMarkers(candleSeries, markers)`.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/stock-chart.tsx
git commit -m "feat(charts): add StockChart client component"
```

---

## Task 7: Wire chart into real `/stock/[ticker]` page

**Files:**

- Modify: `src/app/(auth)/stock/[ticker]/page.tsx`

- [ ] **Step 1: Call priceHistory and render chart**

Add after `const data = await trpc.signals.byTicker({ ticker });`:

```tsx
const priceHistory = await trpc.signals.priceHistory({ ticker, days: 260 });
```

And render above the RationaleCard:

```tsx
{
  priceHistory && priceHistory.bars.length > 0 && (
    <Card>
      <CardHeader>
        <CardTitle>Price History</CardTitle>
      </CardHeader>
      <CardContent>
        <StockChart
          bars={priceHistory.bars}
          ma200Series={priceHistory.ma200Series}
          markers={priceHistory.markers}
        />
      </CardContent>
    </Card>
  );
}
```

Import: `import { StockChart } from '@/components/charts/stock-chart';`

- [ ] **Step 2: Verify tsc + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/(auth)/stock/[ticker]/page.tsx
git commit -m "feat(dashboard): embed StockChart on stock detail page"
```

---

## Task 8: Demo banner component

**Files:**

- Create: `src/components/demo/demo-banner.tsx`

- [ ] **Step 1: Write it**

```tsx
// src/components/demo/demo-banner.tsx
export function DemoBanner() {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-300">
      <strong>Demo mode</strong> — you&rsquo;re browsing synthetic fixture data for UI preview.
      Nothing here is real market data or investment advice.
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/demo/demo-banner.tsx
git commit -m "feat(demo): add DemoBanner component"
```

---

## Task 9: Demo route group — layout + pages

**Files:**

- Create: `src/app/demo/layout.tsx`
- Create: `src/app/demo/page.tsx`
- Create: `src/app/demo/signals/page.tsx`
- Create: `src/app/demo/stock/[ticker]/page.tsx`

- [ ] **Step 1: Demo layout (public, no Clerk wrapper)**

```tsx
// src/app/demo/layout.tsx
import { DemoBanner } from '@/components/demo/demo-banner';
import { SiteNav } from '@/components/layout/site-nav';

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner />
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </>
  );
}
```

- [ ] **Step 2: Root demo redirect**

```tsx
// src/app/demo/page.tsx
import { redirect } from 'next/navigation';
export default function DemoHome() {
  redirect('/demo/signals');
}
```

- [ ] **Step 3: Demo signals list**

```tsx
// src/app/demo/signals/page.tsx
import Link from 'next/link';
import { DEMO_SIGNAL_LIST } from '@/lib/demo/fixtures';
import { SignalCard } from '@/components/signals/signal-card';

export default function DemoSignalsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Demo signals</h1>
        <p className="text-muted-foreground text-sm">
          Three synthetic tickers — click a card to see the chart + AI rationale.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_SIGNAL_LIST.map((s) => (
          <Link key={s.signalId} href={`/demo/stock/${s.stock.ticker}`}>
            <SignalCard
              ticker={s.stock.ticker}
              name={s.stock.name}
              sector={s.stock.sector}
              signalType={s.signalType}
              strength={s.strength}
              volumeConfirmed={s.volumeConfirmed}
              signalScore={s.signalScore}
              fundamentalScore={s.fundamentalScore}
              lastPrice={s.stock.lastPrice}
              targetPrice={s.recommendation?.targetPrice ?? null}
              stopLoss={s.recommendation?.stopLoss ?? null}
              state={s.recommendation?.state ?? null}
              triggeredAt={s.triggeredAt}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
```

Note: `SignalCard` already wraps itself in `<Link href={/stock/${ticker}}>`. For the demo, that would take users to the real (auth-gated) `/stock/[ticker]` page, which is wrong. **Fix:** take the wrapping `Link` out of `SignalCard` and move it to the callers. Update `SignalCard` in Task 9a below.

- [ ] **Step 3a: Refactor SignalCard to remove internal Link**

Modify `src/components/signals/signal-card.tsx`:

Remove the `import Link from 'next/link';` line and the `<Link ...>` wrapper. Replace the return with just the `<Card>...</Card>` (add the hover class to the Card itself). Update both callers:

- `src/app/(auth)/dashboard/signals/page.tsx` — wrap each `<SignalCard>` in `<Link href={...}>`
- `src/app/demo/signals/page.tsx` — wraps in `<Link href={/demo/stock/${ticker}}>` as shown above

- [ ] **Step 4: Demo stock detail page with chart**

```tsx
// src/app/demo/stock/[ticker]/page.tsx
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecommendationStateBadge } from '@/components/signals/recommendation-state-badge';
import { RationaleCard } from '@/components/signals/rationale-card';
import { signalTypeLabel } from '@/components/signals/signal-type-label';
import { StockChart } from '@/components/charts/stock-chart';
import {
  transformPriceHistoryRows,
  buildChartMarkersFromSignals,
} from '@/components/charts/chart-data';
import { DEMO_STOCKS } from '@/lib/demo/fixtures';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

function fmtPrice(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
}

export default async function DemoStockDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  const detail = DEMO_STOCKS[upper];
  if (!detail) notFound();

  const { bars, ma200Series } = transformPriceHistoryRows(detail.priceHistory);
  const markers = buildChartMarkersFromSignals(
    detail.signals.map((s) => ({
      signalType: s.signalType,
      triggeredAt: s.triggeredAt,
      strength: s.strength,
    })),
  );

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-semibold">{detail.stock.ticker}</h1>
          <p className="text-muted-foreground">{detail.stock.name}</p>
        </div>
        {detail.stock.sector && (
          <p className="text-muted-foreground mt-1 text-sm">{detail.stock.sector}</p>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <StockChart bars={bars} ma200Series={ma200Series} markers={markers} />
        </CardContent>
      </Card>

      <RationaleCard
        summary={detail.rationale.summary}
        fundamentalThesis={detail.rationale.fundamentalThesis}
        technicalContext={detail.rationale.technicalContext}
        strategyNote={detail.rationale.strategyNote}
        confidence={detail.rationale.confidence}
        disclaimer={detail.rationale.disclaimer}
      />

      <Card>
        <CardHeader>
          <CardTitle>Signal History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {detail.signals.map((s) => (
              <li
                key={s.signalId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{signalTypeLabel(s.signalType)}</Badge>
                  <Badge variant="secondary">{s.strength.replace('_', ' ')}</Badge>
                  {s.volumeConfirmed && <Badge variant="info">Volume ✓</Badge>}
                </div>
                <div className="text-muted-foreground text-xs">
                  {s.triggeredAt.toISOString().slice(0, 10)}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span>Target {fmtPrice(s.recommendation?.targetPrice ?? null)}</span>
                  <span>Stop {fmtPrice(s.recommendation?.stopLoss ?? null)}</span>
                  <RecommendationStateBadge state={s.recommendation?.state ?? null} />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Verify build + tsc**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/app/demo src/components/signals/signal-card.tsx src/app/\(auth\)/dashboard/signals/page.tsx
git commit -m "feat(demo): add public /demo sandbox with chart + synthetic fixtures"
```

---

## Task 10: Middleware + landing CTA

**Files:**

- Modify: `middleware.ts` (verify, don't actually need to change since `/demo` is not in the protected list)
- Modify: `src/components/landing/hero.tsx`

- [ ] **Step 1: Verify middleware still allows /demo**

Read `middleware.ts`. `isProtectedRoute = ['/dashboard(.*)', '/stock(.*)']` — `/demo` is public by default. ✅ No change.

- [ ] **Step 2: Update hero CTA**

Replace the two existing buttons with:

```tsx
<div className="mt-10 flex items-center justify-center gap-4">
  <Link href="/demo">
    <Button size="lg">Try the demo</Button>
  </Link>
  <Link href="/sign-up">
    <Button size="lg" variant="outline">
      Sign up
    </Button>
  </Link>
</div>
```

(Drop the `/performance` link — that route doesn't exist.)

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/hero.tsx
git commit -m "feat(landing): link to /demo from hero CTA"
```

---

## Task 11: Verify + docs + push

- [ ] **Step 1: Full test + build + lint**

```bash
pnpm test:run && pnpm tsc --noEmit && pnpm build && pnpm lint
```

Expected: all green.

- [ ] **Step 2: Update CLAUDE.md**

Add under Project Structure:

```
    demo/           Phase 9b — public sandbox with synthetic fixture data
      signals/
      stock/[ticker]/
```

And under Tech Stack, mark "Lightweight Charts" as Phase 9b not "later phase".

Add a new Phase 9b bullet in the implicit phase notes if there is one.

- [ ] **Step 3: Format**

```bash
pnpm format
```

- [ ] **Step 4: Commit docs + format**

```bash
git add CLAUDE.md src/
git commit -m "docs: document Phase 9b (charts + /demo sandbox)"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

- [ ] **Step 6: Restart dev server if running**

Note: lightweight-charts is a new dep → dev server must restart. Either kill and re-run `pnpm dev` or let the user do it.

---

## Self-Review Checklist

- [ ] **Spec coverage:** Chart ✅, priceHistory query ✅, demo fixtures ✅, /demo route ✅, landing CTA ✅.
- [ ] **Placeholder scan:** No TBDs.
- [ ] **Type consistency:** `PriceHistoryRow` is defined once in `chart-data.ts` and imported by both the generator and the router. `ChartBar`, `ChartLinePoint`, `ChartMarker` flow through unchanged.
- [ ] **No-mock-data rule:** Demo fixtures live under clearly-labeled `/demo/*` URLs with a banner. Production `/dashboard` and `/stock/[ticker]` still query real DB.
- [ ] **SignalCard refactor:** The internal `<Link>` is removed so demo can override the destination. Both callers updated.
- [ ] **lightweight-charts v5 API:** Uses `addSeries(CandlestickSeries, ...)` and `addSeries(LineSeries, ...)`. If `setMarkers` is not on the series in v5, fall back to `createSeriesMarkers(series, [...])`.
