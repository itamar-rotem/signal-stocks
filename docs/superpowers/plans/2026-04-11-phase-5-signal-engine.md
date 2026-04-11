# Phase 5 — Signal Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect the 7 signal types (SIG-01..SIG-07) over a daily price series, apply eligibility gating, compute volume confirmation, assign strength (possibly downgraded), compute composite signal score, and persist detected signals into the `signals` table.

**Architecture:** Pure functions over a typed `PriceBar[]` series (date, close, ma150, ma200, ma150Slope, ma200Slope, volume). Each signal is its own pure detector returning zero or one `DetectedSignal` per evaluation. An eligibility gate is a pure predicate over stock + latest-bar + fundamentals. A composite-score function combines fundamental score + strength + volume confirmation. A thin orchestrator loads bars from DB, calls detectors, builds rows, upserts into `signals` with `onConflictDoNothing` keyed on `(stock_id, signal_type, triggered_at)`.

**Tech Stack:** Drizzle, Vitest, pure functions. No FMP or external calls in this phase (prices already ingested in Phase 3, fundamentals already scored in Phase 4).

---

## Context You Need Before Starting

1. **Read spec Section 4** (`docs/superpowers/specs/2026-04-10-signalstocks-design.md`) — defines eligibility, signal triggers, volume confirmation, composite score.
2. **Phase 3/4 pattern is load-bearing** — pure functions, schema-strict fixtures, fixture-driven tests, thin orchestrators with per-ticker error isolation.
3. **`signals` table** (`src/server/db/schema/signals.ts`): `id, stockId, signalType, strength, volumeConfirmed, fundamentalScore, signalScore, triggeredAt, source` + numeric columns are strings. Unique index on `(stockId, signalType, triggeredAt)` must already exist — verify in Task 0.
4. **Bar series contract**: signals evaluate against a chronologically-ordered list of bars. The "current" bar is the most recent. Detectors look back up to ~15 bars. Null MA values mean insufficient history and should skip detection gracefully.
5. **No live FMP in Phase 5.** All tests use synthetic bar fixtures (in-code arrays).
6. **Market cap & listing age** for eligibility come from the `stocks` table — `marketCap` (bigint) and `firstListedAt` (date). Both already in schema.
7. **Branch:** main. Commit per task.
8. **Ignore target price / stop loss in this phase** — those come with the recommendation state machine (Phase 7) where they're more naturally placed.

---

## File Structure

New files under `src/server/services/signals/`:

```
types.ts                             # PriceBar, DetectedSignal, StockContext types
types.test.ts                        # type smoke test
eligibility.ts                       # pure eligibility predicate
eligibility.test.ts
volume-confirmation.ts               # 20-day avg volume + 1.5× check
volume-confirmation.test.ts
detectors/
  ma200-approaching.ts               # SIG-01
  ma200-approaching.test.ts
  ma200-breakout.ts                  # SIG-02
  ma200-breakout.test.ts
  ma150-approaching.ts               # SIG-03
  ma150-approaching.test.ts
  ma150-breakout.ts                  # SIG-04
  ma150-breakout.test.ts
  dual-ma-breakout.ts                # SIG-05
  dual-ma-breakout.test.ts
  golden-cross.ts                    # SIG-06
  golden-cross.test.ts
  support-bounce.ts                  # SIG-07
  support-bounce.test.ts
  index.ts                           # array of all detectors
composite-score.ts                   # signal score formula
composite-score.test.ts
ingestion.ts                         # orchestrator: load bars → detect → upsert
cli.ts                               # pnpm detect:signals
index.ts                             # barrel
```

Modify:

```
package.json                         # add detect:signals script
CLAUDE.md                            # document signals service
```

---

## Task 1: Types and PriceBar (TDD smoke)

**Files:**
- Create: `src/server/services/signals/types.ts`
- Create: `src/server/services/signals/types.test.ts`

- [ ] **Step 1: Write smoke test**

```typescript
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
      firstListedAt: '1980-12-12',
      exchange: 'NASDAQ',
      avgDailyVolume20: 50_000_000,
      fundamentalScore: 85,
      source: 'system',
    };
    expect(ctx.source).toBe('system');
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

```bash
pnpm test:run src/server/services/signals/types.test.ts
```

- [ ] **Step 3: Implement `types.ts`**

```typescript
export type SignalType =
  | 'SIG-01'
  | 'SIG-02'
  | 'SIG-03'
  | 'SIG-04'
  | 'SIG-05'
  | 'SIG-06'
  | 'SIG-07';

export type SignalStrength = 'medium' | 'strong' | 'very_strong';

export type SignalSource = 'system' | 'watchlist';

export interface PriceBar {
  date: string; // ISO YYYY-MM-DD
  close: number;
  volume: number;
  ma150: number | null;
  ma200: number | null;
  ma150Slope: number | null;
  ma200Slope: number | null;
}

export interface DetectedSignal {
  signalType: SignalType;
  strength: SignalStrength;
  triggeredAt: string;
  volumeConfirmed: boolean;
  downgraded: boolean;
}

export interface StockContext {
  ticker: string;
  marketCap: number | null;
  firstListedAt: string | null;
  exchange: string;
  avgDailyVolume20: number | null;
  fundamentalScore: number | null;
  source: SignalSource;
}
```

- [ ] **Step 4: Re-run — expect 4/4 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/signals/types.ts src/server/services/signals/types.test.ts
git commit -m "feat(signals): add PriceBar / DetectedSignal / StockContext types"
```

---

## Task 2: Eligibility gate (pure, TDD)

**Files:**
- Create: `src/server/services/signals/eligibility.ts`
- Create: `src/server/services/signals/eligibility.test.ts`

Eligibility spec (from PRD Section 4.1):

| Filter           | System (strict)   | Watchlist (relaxed) |
| ---------------- | ----------------- | ------------------- |
| Exchange         | NYSE/NASDAQ/AMEX  | same                |
| Market Cap       | ≥ $500M           | ≥ $0 (ignored)      |
| Avg Daily Volume | ≥ 500K            | ignored             |
| Price (close)    | ≥ $5              | ≥ $2                |
| Listing Age      | ≥ 12 months       | ≥ 6 months          |
| Fundamental Score| ≥ 60              | ignored             |

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { isEligible } from './eligibility';
import type { StockContext } from './types';

const systemCtx = (overrides: Partial<StockContext> = {}): StockContext => ({
  ticker: 'TEST',
  marketCap: 1_000_000_000, // $1B
  firstListedAt: '2020-01-01', // ~6 years old vs today 2026-04-11
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
      isEligible(systemCtx({ firstListedAt: '2025-11-01' }), LAST_CLOSE, TODAY),
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
      isEligible(watchCtx({ firstListedAt: '2026-02-01' }), 10, TODAY),
    ).toBe(false);
  });

  it('accepts a 7-month-old stock', () => {
    expect(
      isEligible(watchCtx({ firstListedAt: '2025-08-01' }), 10, TODAY),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { StockContext } from './types';

const ALLOWED_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'AMEX']);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const days = (to.getTime() - from.getTime()) / MS_PER_DAY;
  return days / 30.4375;
}

/**
 * Apply the eligibility gate to a stock.
 * `source === 'system'` uses PRD strict filters.
 * `source === 'watchlist'` uses the relaxed filters.
 */
export function isEligible(
  ctx: StockContext,
  lastClose: number,
  today: string,
): boolean {
  if (!ALLOWED_EXCHANGES.has(ctx.exchange)) return false;

  if (ctx.source === 'system') {
    if (ctx.marketCap === null || ctx.marketCap < 500_000_000) return false;
    if (ctx.avgDailyVolume20 === null || ctx.avgDailyVolume20 < 500_000)
      return false;
    if (lastClose < 5) return false;
    if (ctx.fundamentalScore === null || ctx.fundamentalScore < 60) return false;
    if (ctx.firstListedAt === null) return false;
    if (monthsBetween(ctx.firstListedAt, today) < 12) return false;
    return true;
  }

  // watchlist
  if (lastClose < 2) return false;
  if (ctx.firstListedAt === null) return false;
  if (monthsBetween(ctx.firstListedAt, today) < 6) return false;
  return true;
}
```

- [ ] **Step 4: Re-run — expect all 13 tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/signals/eligibility.ts src/server/services/signals/eligibility.test.ts
git commit -m "feat(signals): add eligibility gate for system and watchlist sources"
```

---

## Task 3: Volume confirmation helper (pure, TDD)

**Files:**
- Create: `src/server/services/signals/volume-confirmation.ts`
- Create: `src/server/services/signals/volume-confirmation.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computeAvgVolume, isVolumeConfirmed } from './volume-confirmation';
import type { PriceBar } from './types';

function bar(v: number, i = 0): PriceBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    close: 100,
    volume: v,
    ma150: null,
    ma200: null,
    ma150Slope: null,
    ma200Slope: null,
  };
}

describe('computeAvgVolume', () => {
  it('averages the last N bars excluding the current one', () => {
    const bars = Array.from({ length: 22 }, (_, i) => bar(1_000_000, i));
    // current = index 21; previous 20 bars = indices 1..20
    expect(computeAvgVolume(bars, 21, 20)).toBe(1_000_000);
  });

  it('returns null when history is insufficient', () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar(1_000_000, i));
    expect(computeAvgVolume(bars, 4, 20)).toBeNull();
  });

  it('does not include the current bar in the average', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 20; i++) bars.push(bar(1_000_000, i));
    bars.push(bar(9_999_999, 20)); // current bar
    expect(computeAvgVolume(bars, 20, 20)).toBe(1_000_000);
  });
});

describe('isVolumeConfirmed', () => {
  it('true when current volume ≥ 1.5× avg', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 20; i++) bars.push(bar(1_000_000, i));
    bars.push(bar(1_500_000, 20));
    expect(isVolumeConfirmed(bars, 20)).toBe(true);
  });

  it('false when current volume < 1.5× avg', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 20; i++) bars.push(bar(1_000_000, i));
    bars.push(bar(1_499_999, 20));
    expect(isVolumeConfirmed(bars, 20)).toBe(false);
  });

  it('false when insufficient history', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 5; i++) bars.push(bar(2_000_000, i));
    expect(isVolumeConfirmed(bars, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { PriceBar } from './types';

export const VOLUME_LOOKBACK = 20;
export const VOLUME_MULTIPLIER = 1.5;

/**
 * Average volume over the `lookback` bars strictly before `index`.
 * Returns null when there is insufficient history.
 */
export function computeAvgVolume(
  bars: PriceBar[],
  index: number,
  lookback: number = VOLUME_LOOKBACK,
): number | null {
  if (index < lookback) return null;
  let sum = 0;
  for (let i = index - lookback; i < index; i++) {
    sum += bars[i].volume;
  }
  return sum / lookback;
}

/**
 * A breakout at `index` is volume-confirmed when current volume ≥ 1.5× the
 * 20-bar trailing average.
 */
export function isVolumeConfirmed(bars: PriceBar[], index: number): boolean {
  const avg = computeAvgVolume(bars, index);
  if (avg === null) return false;
  return bars[index].volume >= avg * VOLUME_MULTIPLIER;
}
```

- [ ] **Step 4: Re-run — expect all 6 tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/signals/volume-confirmation.ts src/server/services/signals/volume-confirmation.test.ts
git commit -m "feat(signals): add 20-day volume confirmation helper"
```

---

## Task 4: SIG-01 MA200 Approaching detector (TDD)

**Files:**
- Create: `src/server/services/signals/detectors/ma200-approaching.ts`
- Create: `src/server/services/signals/detectors/ma200-approaching.test.ts`

**Trigger:** latest bar's `close` is within 2% of `ma200` AND `close < ma200` AND `ma200Slope > 0` over the prior 5 days.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { detectMa200Approaching } from './ma200-approaching';
import type { PriceBar } from '../types';

function mkBar(close: number, ma200: number, slope: number, i: number): PriceBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    close,
    volume: 1_000_000,
    ma150: null,
    ma200,
    ma150Slope: null,
    ma200Slope: slope,
  };
}

describe('detectMa200Approaching (SIG-01)', () => {
  it('triggers when close within 2% below MA200 and slope > 0', () => {
    const bars = [mkBar(98, 100, 0.5, 0), mkBar(99, 100, 0.5, 1)];
    const result = detectMa200Approaching(bars);
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SIG-01');
    expect(result!.strength).toBe('medium');
  });

  it('does not trigger when close is above MA200', () => {
    const bars = [mkBar(101, 100, 0.5, 0)];
    expect(detectMa200Approaching(bars)).toBeNull();
  });

  it('does not trigger when close is > 2% below MA200', () => {
    const bars = [mkBar(97, 100, 0.5, 0)];
    expect(detectMa200Approaching(bars)).toBeNull();
  });

  it('does not trigger when slope ≤ 0', () => {
    const bars = [mkBar(99, 100, 0, 0)];
    expect(detectMa200Approaching(bars)).toBeNull();
  });

  it('returns null when ma200 is missing', () => {
    const bars: PriceBar[] = [
      {
        date: '2026-03-01',
        close: 99,
        volume: 1,
        ma150: null,
        ma200: null,
        ma150Slope: null,
        ma200Slope: null,
      },
    ];
    expect(detectMa200Approaching(bars)).toBeNull();
  });

  it('returns null for empty bars', () => {
    expect(detectMa200Approaching([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { PriceBar, DetectedSignal } from '../types';

export const APPROACH_PCT = 0.02;

/**
 * SIG-01 MA200 Approaching.
 * Trigger: latest close is within 2% below MA200 and MA200 slope is positive.
 */
export function detectMa200Approaching(
  bars: PriceBar[],
): DetectedSignal | null {
  if (bars.length === 0) return null;
  const last = bars[bars.length - 1];
  if (last.ma200 === null || last.ma200Slope === null) return null;
  if (last.close >= last.ma200) return null;
  const pctBelow = (last.ma200 - last.close) / last.ma200;
  if (pctBelow > APPROACH_PCT) return null;
  if (last.ma200Slope <= 0) return null;

  return {
    signalType: 'SIG-01',
    strength: 'medium',
    triggeredAt: last.date,
    volumeConfirmed: false,
    downgraded: false,
  };
}
```

- [ ] **Step 4: Re-run — expect 6 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/signals/detectors/ma200-approaching.ts src/server/services/signals/detectors/ma200-approaching.test.ts
git commit -m "feat(signals): add SIG-01 MA200 approaching detector"
```

---

## Task 5: SIG-03 MA150 Approaching detector (TDD)

**Files:**
- Create: `src/server/services/signals/detectors/ma150-approaching.ts`
- Create: `src/server/services/signals/detectors/ma150-approaching.test.ts`

Symmetric to SIG-01 but against `ma150`.

- [ ] **Step 1: Test** — mirror Task 4 tests but use `ma150` / `ma150Slope`.

- [ ] **Step 2: Implement**

```typescript
import type { PriceBar, DetectedSignal } from '../types';
import { APPROACH_PCT } from './ma200-approaching';

export function detectMa150Approaching(
  bars: PriceBar[],
): DetectedSignal | null {
  if (bars.length === 0) return null;
  const last = bars[bars.length - 1];
  if (last.ma150 === null || last.ma150Slope === null) return null;
  if (last.close >= last.ma150) return null;
  const pctBelow = (last.ma150 - last.close) / last.ma150;
  if (pctBelow > APPROACH_PCT) return null;
  if (last.ma150Slope <= 0) return null;

  return {
    signalType: 'SIG-03',
    strength: 'medium',
    triggeredAt: last.date,
    volumeConfirmed: false,
    downgraded: false,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(signals): add SIG-03 MA150 approaching detector"
```

---

## Task 6: SIG-02 MA200 Breakout detector (TDD)

**Files:**
- Create: `src/server/services/signals/detectors/ma200-breakout.ts`
- Create: `src/server/services/signals/detectors/ma200-breakout.test.ts`

**Trigger:** latest bar AND prior bar both have `close > ma200`, AND at least 10 of the 12 bars before that had `close < ma200`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { detectMa200Breakout } from './ma200-breakout';
import type { PriceBar } from '../types';

function mkBar(close: number, i: number): PriceBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    close,
    volume: 1_000_000,
    ma150: null,
    ma200: 100, // fixed MA200
    ma150Slope: null,
    ma200Slope: null,
  };
}

describe('detectMa200Breakout (SIG-02)', () => {
  it('triggers when 2 bars above after ≥10 below', () => {
    const below = Array.from({ length: 12 }, (_, i) => mkBar(95, i));
    const above = [mkBar(105, 12), mkBar(106, 13)];
    const result = detectMa200Breakout([...below, ...above]);
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SIG-02');
    expect(result!.strength).toBe('strong');
    expect(result!.triggeredAt).toBe(above[1].date);
  });

  it('does not trigger when only last bar is above', () => {
    const below = Array.from({ length: 12 }, (_, i) => mkBar(95, i));
    const mixed = [mkBar(95, 12), mkBar(105, 13)];
    expect(detectMa200Breakout([...below, ...mixed])).toBeNull();
  });

  it('does not trigger without enough prior below-bars', () => {
    const short = [
      mkBar(95, 0),
      mkBar(95, 1),
      mkBar(95, 2),
      mkBar(105, 3),
      mkBar(106, 4),
    ];
    expect(detectMa200Breakout(short)).toBeNull();
  });

  it('returns null when MA200 is missing on latest bars', () => {
    const bars: PriceBar[] = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      close: 100,
      volume: 1,
      ma150: null,
      ma200: null,
      ma150Slope: null,
      ma200Slope: null,
    }));
    expect(detectMa200Breakout(bars)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { PriceBar, DetectedSignal } from '../types';

export const BREAKOUT_CONFIRM_DAYS = 2;
export const BREAKOUT_PRIOR_LOOKBACK = 12;
export const BREAKOUT_PRIOR_MIN_BELOW = 10;

function isAbove(bar: PriceBar, maKey: 'ma150' | 'ma200'): boolean | null {
  const ma = bar[maKey];
  if (ma === null) return null;
  return bar.close > ma;
}

export function detectMaBreakout(
  bars: PriceBar[],
  maKey: 'ma150' | 'ma200',
  signalType: 'SIG-02' | 'SIG-04',
): DetectedSignal | null {
  const n = bars.length;
  if (n < BREAKOUT_CONFIRM_DAYS + BREAKOUT_PRIOR_LOOKBACK) return null;

  // Latest `BREAKOUT_CONFIRM_DAYS` bars must all be above
  for (let i = n - BREAKOUT_CONFIRM_DAYS; i < n; i++) {
    const above = isAbove(bars[i], maKey);
    if (above !== true) return null;
  }

  // Of the `BREAKOUT_PRIOR_LOOKBACK` bars before that, at least
  // `BREAKOUT_PRIOR_MIN_BELOW` must have closed below
  let belowCount = 0;
  const priorEnd = n - BREAKOUT_CONFIRM_DAYS;
  const priorStart = priorEnd - BREAKOUT_PRIOR_LOOKBACK;
  for (let i = priorStart; i < priorEnd; i++) {
    const above = isAbove(bars[i], maKey);
    if (above === false) belowCount++;
  }
  if (belowCount < BREAKOUT_PRIOR_MIN_BELOW) return null;

  return {
    signalType,
    strength: 'strong',
    triggeredAt: bars[n - 1].date,
    volumeConfirmed: false,
    downgraded: false,
  };
}

export function detectMa200Breakout(
  bars: PriceBar[],
): DetectedSignal | null {
  return detectMaBreakout(bars, 'ma200', 'SIG-02');
}
```

- [ ] **Step 4: Re-run — expect 4 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/signals/detectors/ma200-breakout.ts src/server/services/signals/detectors/ma200-breakout.test.ts
git commit -m "feat(signals): add SIG-02 MA200 breakout detector with shared helper"
```

---

## Task 7: SIG-04 MA150 Breakout detector (TDD)

**Files:**
- Create: `src/server/services/signals/detectors/ma150-breakout.ts`
- Create: `src/server/services/signals/detectors/ma150-breakout.test.ts`

- [ ] **Step 1: Test** — mirror SIG-02 tests with `ma150`.

- [ ] **Step 2: Implement**

```typescript
import type { PriceBar, DetectedSignal } from '../types';
import { detectMaBreakout } from './ma200-breakout';

export function detectMa150Breakout(
  bars: PriceBar[],
): DetectedSignal | null {
  return detectMaBreakout(bars, 'ma150', 'SIG-04');
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(signals): add SIG-04 MA150 breakout detector"
```

---

## Task 8: SIG-05 Dual MA Breakout detector (TDD)

**Files:**
- Create: `src/server/services/signals/detectors/dual-ma-breakout.ts`
- Create: `src/server/services/signals/detectors/dual-ma-breakout.test.ts`

**Trigger:** price breaks above MA150 AND MA200 within a 5-day window. "Break above" = first bar in the window with `close > ma`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { detectDualMaBreakout } from './dual-ma-breakout';
import type { PriceBar } from '../types';

function mkBar(
  close: number,
  ma150: number | null,
  ma200: number | null,
  i: number,
): PriceBar {
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

describe('detectDualMaBreakout (SIG-05)', () => {
  it('triggers when both MAs broken within 5-day window', () => {
    // 10 bars below both MAs, then day 10 breaks MA150, day 12 breaks MA200
    const bars: PriceBar[] = [];
    for (let i = 0; i < 10; i++) bars.push(mkBar(90, 100, 105, i));
    bars.push(mkBar(101, 100, 105, 10)); // broke MA150
    bars.push(mkBar(102, 100, 105, 11)); // still below MA200
    bars.push(mkBar(106, 100, 105, 12)); // broke MA200 — within 5-day window
    bars.push(mkBar(107, 100, 105, 13));

    const result = detectDualMaBreakout(bars);
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SIG-05');
    expect(result!.strength).toBe('very_strong');
  });

  it('does not trigger when MAs broken > 5 days apart', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 10; i++) bars.push(mkBar(90, 100, 105, i));
    bars.push(mkBar(101, 100, 105, 10)); // broke MA150
    // 6 bars between
    for (let i = 11; i < 17; i++) bars.push(mkBar(101, 100, 105, i));
    bars.push(mkBar(106, 100, 105, 17)); // broke MA200 — 7 days later
    expect(detectDualMaBreakout(bars)).toBeNull();
  });

  it('does not trigger when one MA never breaks', () => {
    const bars: PriceBar[] = [];
    for (let i = 0; i < 14; i++) bars.push(mkBar(101, 100, 105, i));
    expect(detectDualMaBreakout(bars)).toBeNull();
  });

  it('returns null when MAs are missing', () => {
    const bars: PriceBar[] = Array.from({ length: 14 }, (_, i) =>
      mkBar(100, null, null, i),
    );
    expect(detectDualMaBreakout(bars)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { PriceBar, DetectedSignal } from '../types';

export const DUAL_WINDOW_DAYS = 5;

/**
 * Find the index of the most recent "cross above" a given MA — the first day
 * at which the bar closes above MA after having been below on the prior bar.
 * Searches the most recent 15 bars. Returns -1 if not found.
 */
function findRecentBreakIndex(
  bars: PriceBar[],
  maKey: 'ma150' | 'ma200',
): number {
  const windowStart = Math.max(1, bars.length - 15);
  let latest = -1;
  for (let i = windowStart; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    const prevMa = prev[maKey];
    const currMa = curr[maKey];
    if (prevMa === null || currMa === null) continue;
    if (prev.close < prevMa && curr.close > currMa) {
      latest = i;
    }
  }
  return latest;
}

export function detectDualMaBreakout(
  bars: PriceBar[],
): DetectedSignal | null {
  if (bars.length < 2) return null;
  const ma150Idx = findRecentBreakIndex(bars, 'ma150');
  const ma200Idx = findRecentBreakIndex(bars, 'ma200');
  if (ma150Idx === -1 || ma200Idx === -1) return null;
  if (Math.abs(ma150Idx - ma200Idx) > DUAL_WINDOW_DAYS) return null;

  // trigger fires on the later of the two breaks — must be one of the last
  // few bars
  const triggerIdx = Math.max(ma150Idx, ma200Idx);
  if (triggerIdx !== bars.length - 1) return null;

  return {
    signalType: 'SIG-05',
    strength: 'very_strong',
    triggeredAt: bars[triggerIdx].date,
    volumeConfirmed: false,
    downgraded: false,
  };
}
```

- [ ] **Step 4: Re-run — expect 4 PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(signals): add SIG-05 dual MA breakout detector"
```

---

## Task 9: SIG-06 Golden Cross Setup detector (TDD)

**Files:**
- Create: `src/server/services/signals/detectors/golden-cross.ts`
- Create: `src/server/services/signals/detectors/golden-cross.test.ts`

**Trigger:** MA150 crosses above MA200 today (yesterday ma150 ≤ ma200, today ma150 > ma200) AND close is above both.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { detectGoldenCross } from './golden-cross';
import type { PriceBar } from '../types';

function mkBar(
  close: number,
  ma150: number | null,
  ma200: number | null,
  i: number,
): PriceBar {
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

describe('detectGoldenCross (SIG-06)', () => {
  it('triggers when MA150 crosses above MA200 and close above both', () => {
    const bars = [
      mkBar(110, 99, 100, 0),
      mkBar(111, 101, 100, 1), // MA150 crosses above MA200
    ];
    const result = detectGoldenCross(bars);
    expect(result).not.toBeNull();
    expect(result!.strength).toBe('very_strong');
  });

  it('does not trigger when price is below one of the MAs', () => {
    const bars = [mkBar(99, 99, 100, 0), mkBar(99, 101, 100, 1)];
    expect(detectGoldenCross(bars)).toBeNull();
  });

  it('does not trigger without a crossing', () => {
    const bars = [mkBar(110, 101, 100, 0), mkBar(110, 102, 100, 1)];
    expect(detectGoldenCross(bars)).toBeNull();
  });

  it('returns null with insufficient bars', () => {
    expect(detectGoldenCross([mkBar(110, 101, 100, 0)])).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { PriceBar, DetectedSignal } from '../types';

export function detectGoldenCross(
  bars: PriceBar[],
): DetectedSignal | null {
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2];
  const curr = bars[bars.length - 1];
  if (
    prev.ma150 === null ||
    prev.ma200 === null ||
    curr.ma150 === null ||
    curr.ma200 === null
  ) {
    return null;
  }
  const crossed = prev.ma150 <= prev.ma200 && curr.ma150 > curr.ma200;
  if (!crossed) return null;
  if (curr.close <= curr.ma150 || curr.close <= curr.ma200) return null;

  return {
    signalType: 'SIG-06',
    strength: 'very_strong',
    triggeredAt: curr.date,
    volumeConfirmed: false,
    downgraded: false,
  };
}
```

- [ ] **Step 4: Re-run — expect 4 PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(signals): add SIG-06 golden cross detector"
```

---

## Task 10: SIG-07 Support Bounce detector (TDD)

**Files:**
- Create: `src/server/services/signals/detectors/support-bounce.ts`
- Create: `src/server/services/signals/detectors/support-bounce.test.ts`

**Trigger:** Within the last 3 bars, `close` touched MA150 or MA200 from above (within 1% above) AND the latest bar is at least 1.5% above the touch price.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { detectSupportBounce } from './support-bounce';
import type { PriceBar } from '../types';

function mkBar(
  close: number,
  ma150: number,
  ma200: number,
  i: number,
): PriceBar {
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
    const bars = [
      mkBar(110, 100, 90, 0),
      mkBar(100.5, 100, 90, 1),
      mkBar(102.5, 100, 90, 2),
    ];
    const result = detectSupportBounce(bars);
    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('SIG-07');
    expect(result!.strength).toBe('strong');
  });

  it('does not trigger without a touch', () => {
    const bars = [
      mkBar(110, 100, 90, 0),
      mkBar(109, 100, 90, 1),
      mkBar(111, 100, 90, 2),
    ];
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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { PriceBar, DetectedSignal } from '../types';

export const TOUCH_PCT = 0.01;
export const BOUNCE_PCT = 0.015;
export const BOUNCE_LOOKBACK = 3;

export function detectSupportBounce(
  bars: PriceBar[],
): DetectedSignal | null {
  if (bars.length < 2) return null;
  const n = bars.length;
  const last = bars[n - 1];

  const start = Math.max(0, n - 1 - BOUNCE_LOOKBACK);
  for (let i = start; i < n - 1; i++) {
    const touch = bars[i];
    for (const maKey of ['ma150', 'ma200'] as const) {
      const ma = touch[maKey];
      if (ma === null) continue;
      // within 1% above ma
      if (touch.close < ma) continue;
      if ((touch.close - ma) / ma > TOUCH_PCT) continue;
      // bounce: last close ≥ 1.5% above touch close
      if ((last.close - touch.close) / touch.close >= BOUNCE_PCT) {
        return {
          signalType: 'SIG-07',
          strength: 'strong',
          triggeredAt: last.date,
          volumeConfirmed: false,
          downgraded: false,
        };
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Re-run — expect 4 PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(signals): add SIG-07 support bounce detector"
```

---

## Task 11: Detector registry + volume-confirmation post-processing (TDD)

**Files:**
- Create: `src/server/services/signals/detectors/index.ts`
- Create: `src/server/services/signals/detect-all.ts`
- Create: `src/server/services/signals/detect-all.test.ts`

`detect-all.ts` exports `detectAllSignals(bars: PriceBar[]): DetectedSignal[]` that:
1. Runs every detector.
2. For signals that are breakouts (SIG-02, SIG-04, SIG-05, SIG-06), applies volume confirmation — if confirmed, keeps original strength; if not, downgrades strength by one level and sets `downgraded: true`.
3. Sets `volumeConfirmed` accordingly.
4. Returns the non-null results.

- [ ] **Step 1: detectors/index.ts barrel**

```typescript
export * from './ma200-approaching';
export * from './ma150-approaching';
export * from './ma200-breakout';
export * from './ma150-breakout';
export * from './dual-ma-breakout';
export * from './golden-cross';
export * from './support-bounce';
```

- [ ] **Step 2: Failing test for detect-all**

```typescript
import { describe, it, expect } from 'vitest';
import { detectAllSignals, downgradeStrength } from './detect-all';
import type { PriceBar } from './types';

function mkBar(
  close: number,
  i: number,
  overrides: Partial<PriceBar> = {},
): PriceBar {
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
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement `detect-all.ts`**

```typescript
import type { PriceBar, DetectedSignal, SignalStrength, SignalType } from './types';
import { isVolumeConfirmed } from './volume-confirmation';
import {
  detectMa200Approaching,
  detectMa150Approaching,
  detectMa200Breakout,
  detectMa150Breakout,
  detectDualMaBreakout,
  detectGoldenCross,
  detectSupportBounce,
} from './detectors';

const BREAKOUT_SIGNALS: ReadonlySet<SignalType> = new Set([
  'SIG-02',
  'SIG-04',
  'SIG-05',
  'SIG-06',
]);

export function downgradeStrength(s: SignalStrength): SignalStrength {
  if (s === 'very_strong') return 'strong';
  if (s === 'strong') return 'medium';
  return 'medium';
}

export function detectAllSignals(bars: PriceBar[]): DetectedSignal[] {
  const raw = [
    detectMa200Approaching(bars),
    detectMa150Approaching(bars),
    detectMa200Breakout(bars),
    detectMa150Breakout(bars),
    detectDualMaBreakout(bars),
    detectGoldenCross(bars),
    detectSupportBounce(bars),
  ].filter((s): s is DetectedSignal => s !== null);

  const lastIdx = bars.length - 1;

  return raw.map((sig) => {
    if (!BREAKOUT_SIGNALS.has(sig.signalType)) {
      return sig;
    }
    const confirmed = isVolumeConfirmed(bars, lastIdx);
    if (confirmed) {
      return { ...sig, volumeConfirmed: true };
    }
    return {
      ...sig,
      volumeConfirmed: false,
      downgraded: true,
      strength: downgradeStrength(sig.strength),
    };
  });
}
```

- [ ] **Step 5: Re-run — expect 6 PASS**

- [ ] **Step 6: Commit**

```bash
git add src/server/services/signals/detectors/index.ts src/server/services/signals/detect-all.ts src/server/services/signals/detect-all.test.ts
git commit -m "feat(signals): add detector registry with volume-confirmation post-processing"
```

---

## Task 12: Composite signal score (pure, TDD)

**Files:**
- Create: `src/server/services/signals/composite-score.ts`
- Create: `src/server/services/signals/composite-score.test.ts`

Formula per spec Section 4.4:
`Score = (Fundamental × 0.5) + (TechnicalStrength × 0.3) + (VolumeConfirmed × 0.2)`

Strength mapping: medium=50, strong=75, very_strong=100. Volume confirmed=100, unconfirmed=50.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { strengthValue, volumeValue, computeSignalScore } from './composite-score';

describe('strengthValue', () => {
  it('maps strengths to numeric values', () => {
    expect(strengthValue('medium')).toBe(50);
    expect(strengthValue('strong')).toBe(75);
    expect(strengthValue('very_strong')).toBe(100);
  });
});

describe('volumeValue', () => {
  it('returns 100 when confirmed', () => {
    expect(volumeValue(true)).toBe(100);
  });
  it('returns 50 when unconfirmed', () => {
    expect(volumeValue(false)).toBe(50);
  });
});

describe('computeSignalScore', () => {
  it('combines fundamental/technical/volume per spec weights', () => {
    expect(computeSignalScore(100, 'very_strong', true)).toBe(100);
    expect(computeSignalScore(0, 'medium', false)).toBe(25); // 0 + 15 + 10
  });

  it('returns null when fundamental score is null', () => {
    expect(computeSignalScore(null, 'strong', true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { SignalStrength } from './types';

export function strengthValue(s: SignalStrength): number {
  if (s === 'very_strong') return 100;
  if (s === 'strong') return 75;
  return 50;
}

export function volumeValue(confirmed: boolean): number {
  return confirmed ? 100 : 50;
}

/**
 * Composite signal score = fundamental*0.5 + technical*0.3 + volume*0.2
 * Returns null when fundamental score is unavailable (a signal can't be scored
 * without fundamentals).
 */
export function computeSignalScore(
  fundamentalScore: number | null,
  strength: SignalStrength,
  volumeConfirmed: boolean,
): number | null {
  if (fundamentalScore === null) return null;
  return (
    fundamentalScore * 0.5 +
    strengthValue(strength) * 0.3 +
    volumeValue(volumeConfirmed) * 0.2
  );
}
```

- [ ] **Step 4: Re-run — expect 7 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/signals/composite-score.ts src/server/services/signals/composite-score.test.ts
git commit -m "feat(signals): add composite signal score formula"
```

---

## Task 13: Ingestion orchestrator

**Files:**
- Create: `src/server/services/signals/ingestion.ts`

Flow:
1. Accept a `tickers: string[]` list (or fetch full universe).
2. For each ticker:
   - Load stock row + latest fundamentals row + last ~220 daily_prices rows (chronological).
   - Build `PriceBar[]` and `StockContext`.
   - Compute `avgDailyVolume20` from the last 20 bars.
   - Run `isEligible()`. If not eligible, skip (record in summary).
   - Run `detectAllSignals(bars)`.
   - For each detected signal, compute composite score, build an insert row, upsert with `onConflictDoNothing` keyed on `(stockId, signalType, triggeredAt)`.
3. Return `{ signalsCreated, skipped, errors }`.

- [ ] **Step 1: Implement**

```typescript
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  stocks,
  dailyPrices,
  fundamentals,
  signals,
} from '@/server/db/schema';
import { detectAllSignals } from './detect-all';
import { isEligible } from './eligibility';
import { computeSignalScore } from './composite-score';
import { VOLUME_LOOKBACK } from './volume-confirmation';
import type { PriceBar, StockContext } from './types';

export interface SignalIngestionSummary {
  signalsCreated: number;
  skippedIneligible: number;
  processed: number;
  errors: { ticker: string; error: string }[];
}

const PRICE_HISTORY_DAYS = 220;

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function ingestSignalsForTickers(
  tickers: string[],
  today: string = new Date().toISOString().slice(0, 10),
): Promise<SignalIngestionSummary> {
  const summary: SignalIngestionSummary = {
    signalsCreated: 0,
    skippedIneligible: 0,
    processed: 0,
    errors: [],
  };
  if (tickers.length === 0) return summary;

  const stockRows = await db
    .select({
      id: stocks.id,
      ticker: stocks.ticker,
      exchange: stocks.exchange,
      marketCap: stocks.marketCap,
      firstListedAt: stocks.firstListedAt,
    })
    .from(stocks)
    .where(inArray(stocks.ticker, tickers));

  for (const stock of stockRows) {
    summary.processed++;
    try {
      // latest fundamentals
      const [latestFund] = await db
        .select({ fundamentalScore: fundamentals.fundamentalScore })
        .from(fundamentals)
        .where(eq(fundamentals.stockId, stock.id))
        .orderBy(desc(fundamentals.quarter))
        .limit(1);

      const fundamentalScore = latestFund
        ? toNumber(latestFund.fundamentalScore)
        : null;

      // recent prices (chronological)
      const priceRows = await db
        .select({
          date: dailyPrices.date,
          close: dailyPrices.close,
          volume: dailyPrices.volume,
          ma150: dailyPrices.ma150,
          ma200: dailyPrices.ma200,
          ma150Slope: dailyPrices.ma150Slope,
          ma200Slope: dailyPrices.ma200Slope,
        })
        .from(dailyPrices)
        .where(eq(dailyPrices.stockId, stock.id))
        .orderBy(desc(dailyPrices.date))
        .limit(PRICE_HISTORY_DAYS);

      if (priceRows.length === 0) {
        summary.errors.push({
          ticker: stock.ticker,
          error: 'No price history — run pnpm ingest:prices first',
        });
        continue;
      }

      const bars: PriceBar[] = priceRows
        .slice()
        .reverse()
        .map((row) => ({
          date: row.date,
          close: Number(row.close),
          volume: row.volume,
          ma150: toNumber(row.ma150),
          ma200: toNumber(row.ma200),
          ma150Slope: toNumber(row.ma150Slope),
          ma200Slope: toNumber(row.ma200Slope),
        }));

      // Compute avgDailyVolume20 over last 20 bars
      let avgVol20: number | null = null;
      if (bars.length >= VOLUME_LOOKBACK) {
        let sum = 0;
        for (let i = bars.length - VOLUME_LOOKBACK; i < bars.length; i++) {
          sum += bars[i].volume;
        }
        avgVol20 = sum / VOLUME_LOOKBACK;
      }

      const lastBar = bars[bars.length - 1];
      const ctx: StockContext = {
        ticker: stock.ticker,
        marketCap: stock.marketCap,
        firstListedAt: stock.firstListedAt,
        exchange: stock.exchange,
        avgDailyVolume20: avgVol20,
        fundamentalScore,
        source: 'system',
      };

      if (!isEligible(ctx, lastBar.close, today)) {
        summary.skippedIneligible++;
        continue;
      }

      const detected = detectAllSignals(bars);
      if (detected.length === 0) continue;

      const toStr = (n: number | null): string | null =>
        n === null ? null : String(n);

      for (const sig of detected) {
        const score = computeSignalScore(
          fundamentalScore,
          sig.strength,
          sig.volumeConfirmed,
        );
        await db
          .insert(signals)
          .values({
            stockId: stock.id,
            signalType: sig.signalType,
            strength: sig.strength,
            volumeConfirmed: sig.volumeConfirmed,
            fundamentalScore: toStr(fundamentalScore),
            signalScore: toStr(score),
            triggeredAt: sig.triggeredAt,
            source: 'system',
          })
          .onConflictDoNothing({
            target: [signals.stockId, signals.signalType, signals.triggeredAt],
          });
        summary.signalsCreated++;
      }
    } catch (err) {
      summary.errors.push({
        ticker: stock.ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
```

Note: this depends on the `signals` table having `(stockId, signalType, triggeredAt)` as a unique index. Task 0 check: open `src/server/db/schema/signals.ts` and verify — if the index isn't unique, add `.unique()` to the index builder. If it needs a schema change, generate a new migration with `pnpm drizzle-kit generate` and commit separately.

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/server/services/signals/ingestion.ts
git commit -m "feat(signals): add ingestion orchestrator with eligibility + upsert"
```

---

## Task 14: CLI + barrel + npm script + docs + verification + push

**Files:**
- Create: `src/server/services/signals/cli.ts`
- Create: `src/server/services/signals/index.ts`
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Barrel `index.ts`**

```typescript
export * from './types';
export * from './eligibility';
export * from './volume-confirmation';
export * from './composite-score';
export * from './detect-all';
export * from './detectors';
export * from './ingestion';
```

- [ ] **Step 2: CLI `cli.ts`** — modeled on `services/market-data/cli.ts` and `services/fundamentals/cli.ts`. Take optional tickers from argv; otherwise load full universe from `stocks` table. Call `ingestSignalsForTickers` and print a summary (counts + errors).

```typescript
import { db } from '@/server/db';
import { stocks } from '@/server/db/schema';
import { ingestSignalsForTickers } from './ingestion';

async function main() {
  const argTickers = process.argv.slice(2);
  let tickers: string[];

  if (argTickers.length > 0) {
    tickers = argTickers.map((t) => t.toUpperCase());
    console.log(`Detecting signals for ${tickers.length} ticker(s) from CLI args...`);
  } else {
    const rows = await db.select({ ticker: stocks.ticker }).from(stocks);
    tickers = rows.map((r) => r.ticker);
    console.log(`Detecting signals for full universe — ${tickers.length} ticker(s)...`);
  }

  const summary = await ingestSignalsForTickers(tickers);

  console.log('\n=== Signal Detection Summary ===');
  console.log(`Processed:        ${summary.processed}`);
  console.log(`Signals created:  ${summary.signalsCreated}`);
  console.log(`Skipped ineligible: ${summary.skippedIneligible}`);
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
    console.error('Signal detection failed:', err);
    process.exit(1);
  });
```

- [ ] **Step 3: Add npm script**

In `package.json` `"scripts"`, after `"ingest:fundamentals"`:
```json
"detect:signals": "tsx src/server/services/signals/cli.ts"
```

- [ ] **Step 4: Update CLAUDE.md**

Add to "Running Locally" block:
```
pnpm detect:signals        # run signal detectors against stored prices+fundamentals
```

Add to "Project Structure" under `services/`:
```
      signals/      eligibility, detectors, composite scoring, ingestion
```

- [ ] **Step 5: Full verification**

```bash
pnpm format
pnpm lint
pnpm test:run
pnpm build
```

All four must pass. Total tests should be ~130 (81 prior + ~49 new).

- [ ] **Step 6: Commit and push**

```bash
git add src/server/services/signals/cli.ts src/server/services/signals/index.ts package.json CLAUDE.md
git commit -m "chore(signals): wire detect:signals CLI and document Phase 5"
git push origin main
```

---

## Phase 5 Completion Criteria

- [x] All 7 signal detectors (SIG-01..SIG-07) as pure functions with fixture tests
- [x] Eligibility gate for system and watchlist sources
- [x] Volume confirmation with strength downgrade
- [x] Composite signal score (0.5 / 0.3 / 0.2 weights)
- [x] Ingestion orchestrator writes to `signals` table with conflict handling
- [x] CLI: `pnpm detect:signals`
- [x] Lint/format/test/build clean, pushed

## Out of Scope

- Target price / stop loss calculation — deferred to Phase 7 recommendations
- Inngest scheduling — deferred to Phase 8
- Earnings warning suppression — deferred to Phase 7
