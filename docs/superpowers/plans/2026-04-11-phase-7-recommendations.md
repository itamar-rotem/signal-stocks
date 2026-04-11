# Phase 7 — Recommendation State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** For every active signal, maintain a recommendation state (WATCH → BUY → HOLD → TAKE_PARTIAL_PROFIT → SELL / STOP_HIT / DOWNGRADED / EXPIRED). Each cycle: evaluate pure transition rules, recompute dynamic trailing stop, persist the new state (with `signal_recommendations` upsert and `signal_state_log` append), and stub-write outcome rows on terminal transitions.

**Architecture:** Pure FSM module with a single `evaluateTransition(currentState, context) → nextState | null` entrypoint plus per-source helpers. Pure trailing-stop calculator. Pure target/stop initializer. Thin orchestrator drives the FSM over all active signals and writes DB rows.

**Tech Stack:** Drizzle, Vitest, pure functions only for the core logic. No external APIs.

---

## Context You Need Before Starting

1. **Read spec Section 5** (`docs/superpowers/specs/2026-04-10-signalstocks-design.md`) — defines exact transition conditions, trailing stop rules, and side effects.
2. **Prior phases** — Phase 5 populated `signals`, Phase 6 populated `signal_rationales`. This phase writes to `signal_recommendations` and `signal_state_log`, and optionally `signal_outcomes` on terminal transitions.
3. **Schema reminders** (`src/server/db/schema/signals.ts`):
   - `signal_recommendations`: `id, signal_id (FK), state (enum), previousState, targetPrice, stopLoss, trailingStop, aiUpdateText, transitionedAt`. Numeric columns are strings. Indexed by `(signal_id, state)` but **not unique** — we need a unique index to do upsert-on-`signal_id`.
   - `signal_state_log`: append-only; columns `id, signal_id, fromState, toState, reason, createdAt`.
   - `signal_outcomes`: `signal_id (unique)`, `outcome, entryPrice, exitPrice, actualReturnPct, daysHeld, resolvedAt`.
4. **Recommendation state enum** already includes: `WATCH, BUY, HOLD, TAKE_PARTIAL_PROFIT, SELL, STOP_HIT, DOWNGRADED, EXPIRED`.
5. **Initial state rules** — new signals enter as:
   - `WATCH` if not volume-confirmed (downgraded) OR strength=medium
   - `BUY` if volume-confirmed AND strength ∈ {strong, very_strong}
6. **Target price** — spec 4.5 is complex (40% technical resistance, 30% analyst consensus, 30% fundamental fair value). For this phase we use a simplified heuristic: target = entry × (1 + (signalScore/100 × 0.20)), so a 100 score yields +20%, a 60 score yields +12%. Analyst target integration is out of scope and left as a TODO comment.
7. **Stop loss initialization** — spec 4.5: MA200 breakouts → 3-5% below MA200 at signal time; MA150 → 3-5% below MA150; dual → 5% below lower; cap 10% from entry. We use the midpoint 4% for approaching/breakout signals and simplify the cap to 10%.
8. **ATR** — for the Phase 7 simplification we compute 14-day ATR from daily high/low/prev-close that we already ingest.
9. **Branch:** main. Commit per task.

---

## File Structure

New files under `src/server/services/recommendations/`:

```
types.ts                             # RecommendationState, EvaluationContext, Decision
types.test.ts
targets.ts                           # initialTarget, initialStopLoss
targets.test.ts
atr.ts                               # compute14DayATR (pure)
atr.test.ts
trailing-stop.ts                     # dynamic trailing stop calc (pure)
trailing-stop.test.ts
state-machine.ts                     # pure evaluateTransition FSM
state-machine.test.ts
initial-state.ts                     # deriveInitialState for a new signal
initial-state.test.ts
persistence.ts                       # upsert recommendation + append state log + outcome
ingestion.ts                         # orchestrator: evaluate transitions for all active signals
cli.ts                               # pnpm evaluate:recommendations
index.ts                             # barrel
```

Modify:

```
package.json                         # add evaluate:recommendations script
CLAUDE.md                            # document recommendations service
src/server/db/schema/signals.ts      # add unique index on signal_recommendations.signal_id
drizzle/000N_*.sql                   # generated migration
src/server/db/schema/stocks.ts       # daily_prices needs high/low already present — verify
```

---

## Task 1: Types (TDD)

**Files:**

- Create: `src/server/services/recommendations/types.ts`
- Create: `src/server/services/recommendations/types.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import type { RecommendationState, EvaluationContext, Decision } from './types';

describe('recommendation types', () => {
  it('RecommendationState union', () => {
    const s: RecommendationState = 'HOLD';
    expect(s).toBe('HOLD');
  });

  it('Decision no-change', () => {
    const d: Decision = { kind: 'no_change' };
    expect(d.kind).toBe('no_change');
  });

  it('Decision transition', () => {
    const d: Decision = {
      kind: 'transition',
      to: 'SELL',
      reason: 'Target reached',
      newTarget: null,
      newStopLoss: null,
      newTrailingStop: null,
    };
    expect(d.to).toBe('SELL');
  });

  it('EvaluationContext shape', () => {
    const ctx: EvaluationContext = {
      entryPrice: 100,
      currentPrice: 110,
      targetPrice: 120,
      stopLoss: 95,
      trailingStop: null,
      highestCloseSinceEntry: 112,
      atr14: 2.5,
      daysSinceEntry: 5,
      daysInState: 2,
      volumeConfirmed: true,
      fundamentalScore: 75,
      signalStrength: 'strong',
      brokenMa: 150,
      currentMa150: 148,
      currentMa200: 140,
    };
    expect(ctx.currentPrice).toBe(110);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
export type RecommendationState =
  | 'WATCH'
  | 'BUY'
  | 'HOLD'
  | 'TAKE_PARTIAL_PROFIT'
  | 'SELL'
  | 'STOP_HIT'
  | 'DOWNGRADED'
  | 'EXPIRED';

export interface EvaluationContext {
  entryPrice: number;
  currentPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  trailingStop: number | null;
  highestCloseSinceEntry: number;
  atr14: number | null;
  daysSinceEntry: number;
  daysInState: number;
  volumeConfirmed: boolean;
  fundamentalScore: number | null;
  signalStrength: 'medium' | 'strong' | 'very_strong';
  brokenMa: 150 | 200 | null; // which MA the signal broke, if any
  currentMa150: number | null;
  currentMa200: number | null;
}

export type Decision =
  | { kind: 'no_change' }
  | {
      kind: 'transition';
      to: RecommendationState;
      reason: string;
      newTarget: number | null;
      newStopLoss: number | null;
      newTrailingStop: number | null;
    };

export const TERMINAL_STATES: ReadonlySet<RecommendationState> = new Set([
  'SELL',
  'STOP_HIT',
  'EXPIRED',
]);
```

- [ ] **Step 4: Run — expect 4 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/recommendations/types.ts src/server/services/recommendations/types.test.ts
git commit -m "feat(recommendations): add state + EvaluationContext + Decision types"
```

---

## Task 2: Target & stop initializer (TDD)

**Files:**

- Create: `src/server/services/recommendations/targets.ts`
- Create: `src/server/services/recommendations/targets.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { initialTarget, initialStopLoss } from './targets';

describe('initialTarget', () => {
  it('returns entry × (1 + score/100 × 0.20) for a valid score', () => {
    expect(initialTarget(100, 80)).toBeCloseTo(116, 4); // 100 * 1.16
    expect(initialTarget(100, 60)).toBeCloseTo(112, 4);
    expect(initialTarget(100, 100)).toBeCloseTo(120, 4);
  });

  it('returns null when score is null', () => {
    expect(initialTarget(100, null)).toBeNull();
  });

  it('clamps minimum upside at 5% even for very low scores', () => {
    expect(initialTarget(100, 20)).toBeCloseTo(105, 4);
  });
});

describe('initialStopLoss', () => {
  it('ma200 breakout: 4% below MA200, capped at 10% below entry', () => {
    expect(initialStopLoss(100, 200, 95)).toBeCloseTo(95 * 0.96, 4); // 91.2
  });

  it('ma150 breakout: 4% below MA150', () => {
    expect(initialStopLoss(100, 150, 98)).toBeCloseTo(98 * 0.96, 4); // 94.08
  });

  it('caps at 10% below entry (never more aggressive than 90% of entry)', () => {
    // MA very far below entry - raw stop would be 80% of 85 = 68
    // but must not go below 90% of entry = 90
    expect(initialStopLoss(100, 200, 85)).toBeCloseTo(90, 4);
  });

  it('returns null when MA is null', () => {
    expect(initialStopLoss(100, 200, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
/**
 * Target price heuristic (Phase 7 simplification — full spec 4.5 integration
 * with analyst targets is deferred).
 *
 * upsidePct = max(5%, score/100 × 20%)
 * target    = entry × (1 + upsidePct)
 */
export function initialTarget(entryPrice: number, signalScore: number | null): number | null {
  if (signalScore === null) return null;
  const raw = (signalScore / 100) * 0.2;
  const upsidePct = Math.max(0.05, raw);
  return entryPrice * (1 + upsidePct);
}

const STOP_OFFSET_PCT = 0.04; // 4% below the broken MA
const MAX_STOP_PCT = 0.1; // never more than 10% below entry

/**
 * Stop loss heuristic:
 * - Compute raw stop = maLevel × (1 - 4%)
 * - Cap so stop ≥ entry × (1 - 10%)
 */
export function initialStopLoss(
  entryPrice: number,
  _maKind: 150 | 200,
  maLevel: number | null,
): number | null {
  if (maLevel === null) return null;
  const rawStop = maLevel * (1 - STOP_OFFSET_PCT);
  const floor = entryPrice * (1 - MAX_STOP_PCT);
  return Math.max(rawStop, floor);
}
```

- [ ] **Step 4: Run — expect 7 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/recommendations/targets.ts src/server/services/recommendations/targets.test.ts
git commit -m "feat(recommendations): add initial target and stop loss heuristics"
```

---

## Task 3: ATR calculation (TDD)

**Files:**

- Create: `src/server/services/recommendations/atr.ts`
- Create: `src/server/services/recommendations/atr.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { compute14DayATR, type OhlcBar } from './atr';

function bar(high: number, low: number, close: number, i: number): OhlcBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    high,
    low,
    close,
  };
}

describe('compute14DayATR', () => {
  it('returns null with insufficient bars', () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar(11, 9, 10, i));
    expect(compute14DayATR(bars)).toBeNull();
  });

  it('returns a positive ATR for a volatile series', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(100 + i, 90 + i, 95 + i, i));
    const atr = compute14DayATR(bars);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
  });

  it('returns constant TR when series is flat', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(105, 95, 100, i));
    expect(compute14DayATR(bars)).toBeCloseTo(10, 0); // high - low
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
export interface OhlcBar {
  date: string;
  high: number;
  low: number;
  close: number;
}

export const ATR_PERIOD = 14;

/**
 * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
 * ATR = simple average of TR over the last 14 bars.
 * Returns null if fewer than 15 bars (need at least one prevClose + 14 TRs).
 */
export function compute14DayATR(bars: OhlcBar[]): number | null {
  if (bars.length < ATR_PERIOD + 1) return null;
  const trs: number[] = [];
  for (let i = bars.length - ATR_PERIOD; i < bars.length; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];
    const hl = curr.high - curr.low;
    const hc = Math.abs(curr.high - prev.close);
    const lc = Math.abs(curr.low - prev.close);
    trs.push(Math.max(hl, hc, lc));
  }
  return trs.reduce((a, b) => a + b, 0) / ATR_PERIOD;
}
```

- [ ] **Step 4: Run — expect 3 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/recommendations/atr.ts src/server/services/recommendations/atr.test.ts
git commit -m "feat(recommendations): add 14-day ATR computation"
```

---

## Task 4: Trailing stop (TDD)

**Files:**

- Create: `src/server/services/recommendations/trailing-stop.ts`
- Create: `src/server/services/recommendations/trailing-stop.test.ts`

Per spec 5.2: trailing stop = max of

- breakeven trail (entry) if gain ≥ 5%
- profit-lock trail (entry × 1.05) if gain ≥ 10%
- ATR trail (highest close since entry − 2 × ATR)

And always ≥ current stop loss (never loosen).

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computeTrailingStop } from './trailing-stop';

describe('computeTrailingStop', () => {
  it('returns original stop loss when no gain threshold met', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 101, // <5% gain
        highestCloseSinceEntry: 101,
        atr14: 2,
        currentStopLoss: 95,
      }),
    ).toBeCloseTo(97, 4); // highest=101 − 2×2 = 97; max(97, 95) = 97
  });

  it('moves stop to breakeven (entry) at 5% gain', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 105,
        highestCloseSinceEntry: 105,
        atr14: null,
        currentStopLoss: 95,
      }),
    ).toBe(100);
  });

  it('moves stop to entry + 5% at 10% gain', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 110,
        highestCloseSinceEntry: 110,
        atr14: null,
        currentStopLoss: 95,
      }),
    ).toBe(105);
  });

  it('uses highest of breakeven / profit-lock / ATR trail', () => {
    // entry=100, gain=15%, highest=115, atr=3 → ATR trail = 115-6 = 109
    // profit-lock = 105, breakeven = 100. Max = 109
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 115,
        highestCloseSinceEntry: 115,
        atr14: 3,
        currentStopLoss: 95,
      }),
    ).toBeCloseTo(109, 4);
  });

  it('never loosens below current stop loss', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 110,
        highestCloseSinceEntry: 110,
        atr14: null,
        currentStopLoss: 108, // already higher than profit-lock 105
      }),
    ).toBe(108);
  });

  it('null currentStopLoss is treated as -infinity', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 110,
        highestCloseSinceEntry: 110,
        atr14: null,
        currentStopLoss: null,
      }),
    ).toBe(105);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
export interface TrailingStopInput {
  entryPrice: number;
  currentPrice: number;
  highestCloseSinceEntry: number;
  atr14: number | null;
  currentStopLoss: number | null;
}

const BREAKEVEN_GAIN = 0.05;
const PROFIT_LOCK_GAIN = 0.1;
const PROFIT_LOCK_OFFSET = 0.05;
const ATR_MULTIPLIER = 2;

export function computeTrailingStop(input: TrailingStopInput): number {
  const { entryPrice, currentPrice, highestCloseSinceEntry, atr14, currentStopLoss } = input;
  const gainPct = (currentPrice - entryPrice) / entryPrice;

  const candidates: number[] = [];

  if (gainPct >= BREAKEVEN_GAIN) {
    candidates.push(entryPrice);
  }
  if (gainPct >= PROFIT_LOCK_GAIN) {
    candidates.push(entryPrice * (1 + PROFIT_LOCK_OFFSET));
  }
  if (atr14 !== null && atr14 > 0) {
    candidates.push(highestCloseSinceEntry - ATR_MULTIPLIER * atr14);
  }
  if (currentStopLoss !== null) {
    candidates.push(currentStopLoss);
  }

  if (candidates.length === 0) {
    return currentStopLoss ?? -Infinity;
  }
  return Math.max(...candidates);
}
```

- [ ] **Step 4: Run — expect 6 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/recommendations/trailing-stop.ts src/server/services/recommendations/trailing-stop.test.ts
git commit -m "feat(recommendations): add dynamic trailing stop with breakeven/profit-lock/ATR"
```

---

## Task 5: Initial state deriver (TDD)

**Files:**

- Create: `src/server/services/recommendations/initial-state.ts`
- Create: `src/server/services/recommendations/initial-state.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { deriveInitialState } from './initial-state';

describe('deriveInitialState', () => {
  it('returns BUY when strong + volume confirmed', () => {
    expect(deriveInitialState('strong', true)).toBe('BUY');
  });

  it('returns BUY when very_strong + volume confirmed', () => {
    expect(deriveInitialState('very_strong', true)).toBe('BUY');
  });

  it('returns WATCH when volume unconfirmed', () => {
    expect(deriveInitialState('strong', false)).toBe('WATCH');
  });

  it('returns WATCH when strength is medium', () => {
    expect(deriveInitialState('medium', true)).toBe('WATCH');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { RecommendationState } from './types';

export function deriveInitialState(
  strength: 'medium' | 'strong' | 'very_strong',
  volumeConfirmed: boolean,
): RecommendationState {
  if (volumeConfirmed && (strength === 'strong' || strength === 'very_strong')) {
    return 'BUY';
  }
  return 'WATCH';
}
```

- [ ] **Step 4: Run — expect 4 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/recommendations/initial-state.ts src/server/services/recommendations/initial-state.test.ts
git commit -m "feat(recommendations): add initial state deriver from strength + volume"
```

---

## Task 6: Pure FSM (TDD)

**Files:**

- Create: `src/server/services/recommendations/state-machine.ts`
- Create: `src/server/services/recommendations/state-machine.test.ts`

Rules encoded (from spec 5.1):

- WATCH → BUY when volumeConfirmed becomes true AND strength ≥ strong (we re-derive from ctx)
- WATCH → EXPIRED after 30 days
- BUY → HOLD after 1 day
- HOLD → SELL when currentPrice ≥ targetPrice
- HOLD → STOP_HIT when currentPrice ≤ stopLoss
- HOLD → TAKE_PARTIAL_PROFIT when currentPrice crosses 50% of distance to target (gain ≥ half the planned upside)
- HOLD → DOWNGRADED when fundamentalScore < 50 OR (brokenMa === 150 && currentPrice < currentMa150) OR (brokenMa === 200 && currentPrice < currentMa200)
- TAKE_PARTIAL_PROFIT → SELL when currentPrice ≥ targetPrice
- TAKE_PARTIAL_PROFIT → STOP_HIT when currentPrice ≤ trailingStop (or stopLoss if trailing null)
- DOWNGRADED → STOP_HIT when currentPrice ≤ stopLoss
- DOWNGRADED → HOLD when fundamentalScore ≥ 60 AND price reclaims MA
- Any active (non-terminal) → EXPIRED after 30 days in same state + no progress

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateTransition } from './state-machine';
import type { EvaluationContext } from './types';

const baseCtx: EvaluationContext = {
  entryPrice: 100,
  currentPrice: 105,
  targetPrice: 120,
  stopLoss: 95,
  trailingStop: null,
  highestCloseSinceEntry: 105,
  atr14: 2,
  daysSinceEntry: 1,
  daysInState: 1,
  volumeConfirmed: true,
  fundamentalScore: 75,
  signalStrength: 'strong',
  brokenMa: 200,
  currentMa150: 98,
  currentMa200: 96,
};

describe('evaluateTransition', () => {
  describe('WATCH', () => {
    it('transitions to BUY when volume confirms with strong strength', () => {
      const d = evaluateTransition('WATCH', baseCtx);
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('BUY');
    });

    it('expires after 30 days', () => {
      const d = evaluateTransition('WATCH', {
        ...baseCtx,
        daysInState: 31,
        volumeConfirmed: false,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('EXPIRED');
    });

    it('stays in WATCH otherwise', () => {
      const d = evaluateTransition('WATCH', {
        ...baseCtx,
        volumeConfirmed: false,
        daysInState: 5,
      });
      expect(d.kind).toBe('no_change');
    });
  });

  describe('BUY', () => {
    it('transitions to HOLD after a day', () => {
      const d = evaluateTransition('BUY', { ...baseCtx, daysInState: 1 });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('HOLD');
    });
  });

  describe('HOLD', () => {
    it('transitions to SELL when price reaches target', () => {
      const d = evaluateTransition('HOLD', { ...baseCtx, currentPrice: 121 });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('SELL');
    });

    it('transitions to STOP_HIT when price falls to stop', () => {
      const d = evaluateTransition('HOLD', { ...baseCtx, currentPrice: 94 });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('STOP_HIT');
    });

    it('transitions to TAKE_PARTIAL_PROFIT at 50% of upside', () => {
      // entry 100, target 120, halfway = 110
      const d = evaluateTransition('HOLD', { ...baseCtx, currentPrice: 111 });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('TAKE_PARTIAL_PROFIT');
    });

    it('transitions to DOWNGRADED when fundamental score drops', () => {
      const d = evaluateTransition('HOLD', {
        ...baseCtx,
        fundamentalScore: 45,
        currentPrice: 105, // not hit target or stop
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('DOWNGRADED');
    });

    it('transitions to DOWNGRADED when price falls back below broken MA200', () => {
      const d = evaluateTransition('HOLD', {
        ...baseCtx,
        currentPrice: 95.5, // below ma200=96
        stopLoss: 90, // not hit
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('DOWNGRADED');
    });

    it('stays in HOLD otherwise', () => {
      const d = evaluateTransition('HOLD', baseCtx);
      expect(d.kind).toBe('no_change');
    });
  });

  describe('TAKE_PARTIAL_PROFIT', () => {
    it('transitions to SELL when price reaches target', () => {
      const d = evaluateTransition('TAKE_PARTIAL_PROFIT', {
        ...baseCtx,
        currentPrice: 120,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('SELL');
    });

    it('transitions to STOP_HIT when price falls to trailing stop', () => {
      const d = evaluateTransition('TAKE_PARTIAL_PROFIT', {
        ...baseCtx,
        currentPrice: 104,
        trailingStop: 105,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('STOP_HIT');
    });
  });

  describe('DOWNGRADED', () => {
    it('transitions to STOP_HIT on continued fall', () => {
      const d = evaluateTransition('DOWNGRADED', {
        ...baseCtx,
        currentPrice: 90,
        stopLoss: 92,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('STOP_HIT');
    });

    it('recovers to HOLD when fundamentals ≥ 60 and price reclaims MA', () => {
      const d = evaluateTransition('DOWNGRADED', {
        ...baseCtx,
        currentPrice: 105,
        fundamentalScore: 70,
        currentMa200: 100,
      });
      expect(d.kind).toBe('transition');
      if (d.kind === 'transition') expect(d.to).toBe('HOLD');
    });
  });

  describe('terminal states', () => {
    it('SELL is terminal', () => {
      expect(evaluateTransition('SELL', baseCtx).kind).toBe('no_change');
    });
    it('STOP_HIT is terminal', () => {
      expect(evaluateTransition('STOP_HIT', baseCtx).kind).toBe('no_change');
    });
    it('EXPIRED is terminal', () => {
      expect(evaluateTransition('EXPIRED', baseCtx).kind).toBe('no_change');
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { Decision, EvaluationContext, RecommendationState } from './types';
import { TERMINAL_STATES } from './types';

const WATCH_EXPIRY_DAYS = 30;

function hitTarget(ctx: EvaluationContext): boolean {
  return ctx.targetPrice !== null && ctx.currentPrice >= ctx.targetPrice;
}

function hitStop(ctx: EvaluationContext): boolean {
  return ctx.stopLoss !== null && ctx.currentPrice <= ctx.stopLoss;
}

function hitTrailingStop(ctx: EvaluationContext): boolean {
  const stop = ctx.trailingStop ?? ctx.stopLoss;
  return stop !== null && ctx.currentPrice <= stop;
}

function priceBelowBrokenMa(ctx: EvaluationContext): boolean {
  if (ctx.brokenMa === 150 && ctx.currentMa150 !== null) {
    return ctx.currentPrice < ctx.currentMa150;
  }
  if (ctx.brokenMa === 200 && ctx.currentMa200 !== null) {
    return ctx.currentPrice < ctx.currentMa200;
  }
  return false;
}

function priceReclaimedMa(ctx: EvaluationContext): boolean {
  if (ctx.brokenMa === 150 && ctx.currentMa150 !== null) {
    return ctx.currentPrice > ctx.currentMa150;
  }
  if (ctx.brokenMa === 200 && ctx.currentMa200 !== null) {
    return ctx.currentPrice > ctx.currentMa200;
  }
  return false;
}

function halfwayToTarget(ctx: EvaluationContext): boolean {
  if (ctx.targetPrice === null) return false;
  const halfway = ctx.entryPrice + (ctx.targetPrice - ctx.entryPrice) * 0.5;
  return ctx.currentPrice >= halfway;
}

function transition(
  to: RecommendationState,
  reason: string,
  overrides: Partial<Decision & { kind: 'transition' }> = {},
): Decision {
  return {
    kind: 'transition',
    to,
    reason,
    newTarget: null,
    newStopLoss: null,
    newTrailingStop: null,
    ...overrides,
  } as Decision;
}

export function evaluateTransition(current: RecommendationState, ctx: EvaluationContext): Decision {
  if (TERMINAL_STATES.has(current)) return { kind: 'no_change' };

  switch (current) {
    case 'WATCH': {
      if (
        ctx.volumeConfirmed &&
        (ctx.signalStrength === 'strong' || ctx.signalStrength === 'very_strong')
      ) {
        return transition('BUY', 'Signal confirmed (volume + strength)');
      }
      if (ctx.daysInState > WATCH_EXPIRY_DAYS) {
        return transition('EXPIRED', `${WATCH_EXPIRY_DAYS} days without confirmation`);
      }
      return { kind: 'no_change' };
    }

    case 'BUY': {
      if (ctx.daysInState >= 1) {
        return transition('HOLD', 'Day-after follow-through');
      }
      return { kind: 'no_change' };
    }

    case 'HOLD': {
      if (hitTarget(ctx)) {
        return transition('SELL', 'Target reached');
      }
      if (hitStop(ctx)) {
        return transition('STOP_HIT', 'Stop loss hit');
      }
      if (halfwayToTarget(ctx)) {
        return transition('TAKE_PARTIAL_PROFIT', '50% of upside captured');
      }
      if (ctx.fundamentalScore !== null && ctx.fundamentalScore < 50) {
        return transition('DOWNGRADED', 'Fundamental score dropped below 50');
      }
      if (priceBelowBrokenMa(ctx)) {
        return transition('DOWNGRADED', `Price fell back below MA${ctx.brokenMa}`);
      }
      if (ctx.daysInState > WATCH_EXPIRY_DAYS) {
        return transition('EXPIRED', `${WATCH_EXPIRY_DAYS} days without progress`);
      }
      return { kind: 'no_change' };
    }

    case 'TAKE_PARTIAL_PROFIT': {
      if (hitTarget(ctx)) {
        return transition('SELL', 'Target reached after partial profit');
      }
      if (hitTrailingStop(ctx)) {
        return transition('STOP_HIT', 'Trailing stop hit');
      }
      if (ctx.daysInState > WATCH_EXPIRY_DAYS) {
        return transition('EXPIRED', `${WATCH_EXPIRY_DAYS} days without progress`);
      }
      return { kind: 'no_change' };
    }

    case 'DOWNGRADED': {
      if (hitStop(ctx)) {
        return transition('STOP_HIT', 'Stop hit while downgraded');
      }
      if (ctx.fundamentalScore !== null && ctx.fundamentalScore >= 60 && priceReclaimedMa(ctx)) {
        return transition('HOLD', 'Fundamentals recovered and price reclaimed MA');
      }
      if (ctx.daysInState > WATCH_EXPIRY_DAYS) {
        return transition('EXPIRED', `${WATCH_EXPIRY_DAYS} days downgraded without recovery`);
      }
      return { kind: 'no_change' };
    }

    default:
      return { kind: 'no_change' };
  }
}
```

- [ ] **Step 4: Run — expect 14 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/recommendations/state-machine.ts src/server/services/recommendations/state-machine.test.ts
git commit -m "feat(recommendations): add pure FSM with all transition rules"
```

---

## Task 7: Schema change + migration

**Files:**

- Modify: `src/server/db/schema/signals.ts`
- Create: `drizzle/000N_*.sql`

We need a unique index on `signal_recommendations.signal_id` so the orchestrator can upsert the current recommendation without loading the existing row first. The existing `signalStateIdx` on `(signal_id, state)` stays.

- [ ] **Step 1: Edit schema**

Add to the `signalRecommendations` index config (keep the existing one):

```typescript
(table) => ({
  signalStateIdx: index('signal_recommendations_signal_state_idx').on(
    table.signalId,
    table.state,
  ),
  signalIdUniq: uniqueIndex('signal_recommendations_signal_id_idx').on(table.signalId),
}),
```

Ensure `uniqueIndex` is imported.

- [ ] **Step 2: Generate migration**

```bash
pnpm drizzle-kit generate
```

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema/signals.ts drizzle/
git commit -m "feat(db): add unique index on signal_recommendations.signal_id"
```

---

## Task 8: Persistence

**Files:**

- Create: `src/server/services/recommendations/persistence.ts`

Exports:

- `upsertRecommendation(signalId, decision, prevState, state, target, stopLoss, trailingStop)`
- `appendStateLog(signalId, fromState, toState, reason)`
- `writeOutcomeIfTerminal(signalId, decision, entryPrice, currentPrice, daysHeld)` — writes to `signal_outcomes` only for SELL / STOP_HIT / EXPIRED.

```typescript
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { signalRecommendations, signalStateLog, signalOutcomes } from '@/server/db/schema';
import type { RecommendationState, Decision } from './types';
import { TERMINAL_STATES } from './types';

const toStr = (n: number | null): string | null => (n === null ? null : String(n));

export async function upsertRecommendation(params: {
  signalId: number;
  state: RecommendationState;
  previousState: RecommendationState | null;
  targetPrice: number | null;
  stopLoss: number | null;
  trailingStop: number | null;
}): Promise<void> {
  const { signalId, state, previousState, targetPrice, stopLoss, trailingStop } = params;
  await db
    .insert(signalRecommendations)
    .values({
      signalId,
      state,
      previousState: previousState ?? null,
      targetPrice: toStr(targetPrice),
      stopLoss: toStr(stopLoss),
      trailingStop: toStr(trailingStop),
    })
    .onConflictDoUpdate({
      target: signalRecommendations.signalId,
      set: {
        state: sql`excluded.state`,
        previousState: sql`excluded.previous_state`,
        targetPrice: sql`excluded.target_price`,
        stopLoss: sql`excluded.stop_loss`,
        trailingStop: sql`excluded.trailing_stop`,
        transitionedAt: sql`now()`,
      },
    });
}

export async function appendStateLog(params: {
  signalId: number;
  fromState: RecommendationState | null;
  toState: RecommendationState;
  reason: string;
}): Promise<void> {
  await db.insert(signalStateLog).values({
    signalId: params.signalId,
    fromState: params.fromState ?? null,
    toState: params.toState,
    reason: params.reason,
  });
}

export async function writeOutcomeIfTerminal(params: {
  signalId: number;
  decision: Decision;
  entryPrice: number;
  exitPrice: number;
  daysHeld: number;
}): Promise<void> {
  if (params.decision.kind !== 'transition') return;
  if (!TERMINAL_STATES.has(params.decision.to)) return;

  const outcome =
    params.decision.to === 'SELL'
      ? 'target_hit'
      : params.decision.to === 'STOP_HIT'
        ? 'stopped_out'
        : 'expired';

  const actualReturnPct = ((params.exitPrice - params.entryPrice) / params.entryPrice) * 100;

  await db
    .insert(signalOutcomes)
    .values({
      signalId: params.signalId,
      outcome,
      entryPrice: String(params.entryPrice),
      exitPrice: String(params.exitPrice),
      actualReturnPct: String(actualReturnPct),
      daysHeld: params.daysHeld,
    })
    .onConflictDoNothing({ target: signalOutcomes.signalId });
}
```

- [ ] **Step 2: Typecheck** — `pnpm tsc --noEmit`
- [ ] **Step 3: Commit**

```bash
git add src/server/services/recommendations/persistence.ts
git commit -m "feat(recommendations): add persistence (upsert + state log + outcomes)"
```

---

## Task 9: Ingestion orchestrator

**Files:**

- Create: `src/server/services/recommendations/ingestion.ts`

Flow:

1. Load all signals not in a terminal recommendation state (LEFT JOIN signal_recommendations; WHERE state is null OR state NOT IN terminal).
2. For each: load last ~30 daily prices (for ATR + highest close since entry + current price), latest fundamentals (for fundamentalScore).
3. Build `EvaluationContext`.
4. If no existing recommendation row → it's a new signal → call `deriveInitialState(...)` → upsert with `initialTarget` / `initialStopLoss` / null trailingStop, append state log, skip FSM evaluation.
5. Otherwise, compute trailing stop, evaluate FSM transition, and if transition:
   - Upsert recommendation with new state + new trailingStop (always) + target/stop from decision or existing.
   - Append state log with reason.
   - Write outcome if terminal.
6. Return summary.

```typescript
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { signals, signalRecommendations, fundamentals, dailyPrices } from '@/server/db/schema';
import { deriveInitialState } from './initial-state';
import { initialTarget, initialStopLoss } from './targets';
import { compute14DayATR } from './atr';
import { computeTrailingStop } from './trailing-stop';
import { evaluateTransition } from './state-machine';
import { upsertRecommendation, appendStateLog, writeOutcomeIfTerminal } from './persistence';
import type { EvaluationContext, RecommendationState } from './types';

export interface EvaluationSummary {
  processed: number;
  created: number;
  transitions: number;
  unchanged: number;
  errors: { signalId: number; error: string }[];
}

const TERMINAL: RecommendationState[] = ['SELL', 'STOP_HIT', 'EXPIRED'];

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function evaluateAllActiveSignals(): Promise<EvaluationSummary> {
  const summary: EvaluationSummary = {
    processed: 0,
    created: 0,
    transitions: 0,
    unchanged: 0,
    errors: [],
  };

  const rows = await db
    .select({
      signalId: signals.id,
      stockId: signals.stockId,
      signalType: signals.signalType,
      strength: signals.strength,
      volumeConfirmed: signals.volumeConfirmed,
      signalScore: signals.signalScore,
      triggeredAt: signals.triggeredAt,
      recState: signalRecommendations.state,
      recTarget: signalRecommendations.targetPrice,
      recStop: signalRecommendations.stopLoss,
      recTrailing: signalRecommendations.trailingStop,
      recTransitionedAt: signalRecommendations.transitionedAt,
    })
    .from(signals)
    .leftJoin(signalRecommendations, eq(signalRecommendations.signalId, signals.id))
    .where(or(isNull(signalRecommendations.id), notInArray(signalRecommendations.state, TERMINAL)));

  for (const row of rows) {
    summary.processed++;
    try {
      // latest fundamentals
      const [fund] = await db
        .select({ fundamentalScore: fundamentals.fundamentalScore })
        .from(fundamentals)
        .where(eq(fundamentals.stockId, row.stockId))
        .orderBy(desc(fundamentals.quarter))
        .limit(1);
      const fundamentalScore = fund ? toNumber(fund.fundamentalScore) : null;

      // recent prices
      const priceRows = await db
        .select({
          date: dailyPrices.date,
          high: dailyPrices.high,
          low: dailyPrices.low,
          close: dailyPrices.close,
          ma150: dailyPrices.ma150,
          ma200: dailyPrices.ma200,
        })
        .from(dailyPrices)
        .where(eq(dailyPrices.stockId, row.stockId))
        .orderBy(desc(dailyPrices.date))
        .limit(60);

      if (priceRows.length === 0) {
        summary.errors.push({
          signalId: row.signalId,
          error: 'no price history',
        });
        continue;
      }

      const bars = priceRows.slice().reverse();
      const currentBar = bars[bars.length - 1];
      const currentPrice = Number(currentBar.close);
      const currentMa150 = toNumber(currentBar.ma150);
      const currentMa200 = toNumber(currentBar.ma200);

      const atrBars = bars.map((b) => ({
        date: b.date,
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
      }));
      const atr14 = compute14DayATR(atrBars);

      // determine brokenMa from signal type (SIG-02 → 200, SIG-04 → 150, SIG-05/06 → 200)
      const brokenMa: 150 | 200 | null =
        row.signalType === 'SIG-04'
          ? 150
          : row.signalType === 'SIG-02' ||
              row.signalType === 'SIG-05' ||
              row.signalType === 'SIG-06'
            ? 200
            : null;

      // Entry price = close on signal triggered_at date (find in bars)
      const triggeredDate = new Date(row.triggeredAt).toISOString().slice(0, 10);
      const entryBarIdx = bars.findIndex((b) => b.date >= triggeredDate);
      const entryPrice = entryBarIdx >= 0 ? Number(bars[entryBarIdx].close) : currentPrice;

      // Highest close since entry
      const highestCloseSinceEntry = bars
        .slice(entryBarIdx >= 0 ? entryBarIdx : 0)
        .reduce((max, b) => Math.max(max, Number(b.close)), entryPrice);

      const daysSinceEntry = Math.max(
        0,
        Math.round(
          (new Date(currentBar.date).getTime() - new Date(triggeredDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );

      const daysInState = row.recTransitionedAt
        ? Math.max(
            0,
            Math.round(
              (new Date(currentBar.date).getTime() - new Date(row.recTransitionedAt).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : daysSinceEntry;

      // New signal — no recommendation row exists yet
      if (!row.recState) {
        const initial = deriveInitialState(row.strength, row.volumeConfirmed);
        const tgt = initialTarget(entryPrice, toNumber(row.signalScore));
        const stop = initialStopLoss(
          entryPrice,
          brokenMa ?? 200,
          brokenMa === 150 ? currentMa150 : currentMa200,
        );
        await upsertRecommendation({
          signalId: row.signalId,
          state: initial,
          previousState: null,
          targetPrice: tgt,
          stopLoss: stop,
          trailingStop: null,
        });
        await appendStateLog({
          signalId: row.signalId,
          fromState: null,
          toState: initial,
          reason: 'Signal created',
        });
        summary.created++;
        continue;
      }

      const targetPrice = toNumber(row.recTarget);
      const stopLoss = toNumber(row.recStop);

      const trailingStop = computeTrailingStop({
        entryPrice,
        currentPrice,
        highestCloseSinceEntry,
        atr14,
        currentStopLoss: stopLoss,
      });

      const ctx: EvaluationContext = {
        entryPrice,
        currentPrice,
        targetPrice,
        stopLoss,
        trailingStop,
        highestCloseSinceEntry,
        atr14,
        daysSinceEntry,
        daysInState,
        volumeConfirmed: row.volumeConfirmed,
        fundamentalScore,
        signalStrength: row.strength as 'medium' | 'strong' | 'very_strong',
        brokenMa,
        currentMa150,
        currentMa200,
      };

      const decision = evaluateTransition(row.recState as RecommendationState, ctx);

      if (decision.kind === 'no_change') {
        // still update trailing stop even if no transition
        if (trailingStop !== stopLoss) {
          await upsertRecommendation({
            signalId: row.signalId,
            state: row.recState as RecommendationState,
            previousState: row.recState as RecommendationState,
            targetPrice,
            stopLoss,
            trailingStop,
          });
        }
        summary.unchanged++;
        continue;
      }

      // transition
      await upsertRecommendation({
        signalId: row.signalId,
        state: decision.to,
        previousState: row.recState as RecommendationState,
        targetPrice,
        stopLoss,
        trailingStop,
      });
      await appendStateLog({
        signalId: row.signalId,
        fromState: row.recState as RecommendationState,
        toState: decision.to,
        reason: decision.reason,
      });
      await writeOutcomeIfTerminal({
        signalId: row.signalId,
        decision,
        entryPrice,
        exitPrice: currentPrice,
        daysHeld: daysSinceEntry,
      });
      summary.transitions++;
    } catch (err) {
      summary.errors.push({
        signalId: row.signalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
```

- [ ] **Step 2: Typecheck** — `pnpm tsc --noEmit`
- [ ] **Step 3: Commit**

```bash
git add src/server/services/recommendations/ingestion.ts
git commit -m "feat(recommendations): add orchestrator over active signals"
```

---

## Task 10: CLI + barrel + script + docs + verification + push

**Files:**

- Create: `src/server/services/recommendations/cli.ts`
- Create: `src/server/services/recommendations/index.ts`
- Modify: `package.json`, `CLAUDE.md`

- [ ] **Step 1: Barrel `index.ts`**

```typescript
export * from './types';
export * from './targets';
export * from './atr';
export * from './trailing-stop';
export * from './initial-state';
export * from './state-machine';
export * from './persistence';
export * from './ingestion';
```

- [ ] **Step 2: CLI `cli.ts`**

```typescript
import { evaluateAllActiveSignals } from './ingestion';

async function main() {
  console.log('Evaluating all active signal recommendations...');
  const summary = await evaluateAllActiveSignals();

  console.log('\n=== Recommendation Summary ===');
  console.log(`Processed:   ${summary.processed}`);
  console.log(`Created:     ${summary.created}`);
  console.log(`Transitions: ${summary.transitions}`);
  console.log(`Unchanged:   ${summary.unchanged}`);
  if (summary.errors.length > 0) {
    console.log(`\nErrors: ${summary.errors.length}`);
    for (const e of summary.errors) {
      console.log(`  signal=${e.signalId} → ${e.error}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Recommendation evaluation failed:', err);
    process.exit(1);
  });
```

- [ ] **Step 3: package.json script** after `generate:rationale`:

```json
"evaluate:recommendations": "tsx src/server/services/recommendations/cli.ts"
```

- [ ] **Step 4: CLAUDE.md**

"Running Locally" after `pnpm generate:rationale`:

```
pnpm evaluate:recommendations    # run FSM over active signals
```

"Project Structure" under `services/` after `ai/`:

```
      recommendations/ FSM, target/stop calc, trailing stop, orchestrator
```

- [ ] **Step 5: Full verification**

```bash
pnpm format
pnpm lint
pnpm test:run
pnpm build
```

All four must pass. Total tests ~220.

- [ ] **Step 6: Commit and push**

```bash
git add src/server/services/recommendations/cli.ts src/server/services/recommendations/index.ts package.json CLAUDE.md
git commit -m "chore(recommendations): wire evaluate:recommendations CLI and document Phase 7"
git push origin main
```

---

## Phase 7 Completion Criteria

- [x] Pure `evaluateTransition` FSM covering all spec 5.1 rules
- [x] Pure `computeTrailingStop` with breakeven + profit-lock + ATR combination
- [x] Pure `compute14DayATR`
- [x] Pure `initialTarget` and `initialStopLoss`
- [x] Initial state deriver from strength + volume
- [x] Unique index on `signal_recommendations.signal_id`
- [x] Persistence layer writes state log + outcomes
- [x] Orchestrator evaluates all active signals in one pass
- [x] CLI: `pnpm evaluate:recommendations`
- [x] Lint/format/test/build clean, pushed

## Out of Scope

- Analyst target integration (spec 4.5)
- AI rationale update trigger on transition (handled by Phase 6 generation.ts update flow when triggered elsewhere)
- Email alert queuing (Phase 13)
- User-acknowledge transition BUY→HOLD (currently auto-transitions after 1 day)
- Backtesting with these rules (Phase 11)
