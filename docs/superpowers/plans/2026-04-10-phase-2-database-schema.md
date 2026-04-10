# Phase 2 — Database Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the complete Drizzle schema for all 14 tables from the design spec Section 3, generate the SQL migration, and add a seed script that loads a starter stock universe.

**Architecture:** Split the schema by domain into four files under `src/server/db/schema/` — `enums.ts`, `stocks.ts`, `signals.ts`, `users.ts`, `simulation.ts` — exported through a barrel `index.ts`. Drizzle config points at the barrel. The seed loads from a static JSON file (Phase 3 will fetch the full universe from FMP). Pure parsing logic is unit-tested; schema correctness is gated by a smoke test and `drizzle-kit generate`.

**Tech Stack:** Drizzle ORM 0.45.2, drizzle-kit 0.31.10, `@neondatabase/serverless` 1.0.2, Vitest 4.1.4, zod 4.3.6.

---

## Context You Need Before Starting

1. **Read** `docs/superpowers/specs/2026-04-10-signalstocks-design.md` Section 3 — the table list is the source of truth for column names/types.
2. **Read** `AGENTS.md` — Next.js 16 / Drizzle 0.45 may differ from training data. If any drizzle-orm API in this plan fails, read `node_modules/drizzle-orm/pg-core/*.d.ts` before making assumptions.
3. **Current state** (Phase 1 end):
   - `src/server/db/schema.ts` is an empty stub (`export {};`). It will be deleted in Task 1.
   - `src/server/db/index.ts` imports `./schema` — this will continue to work because `./schema/index.ts` resolves the same way.
   - `drizzle.config.ts` points at `./src/server/db/schema.ts` — must be updated in Task 7.
4. **Do NOT run `pnpm db:push`** as part of this plan. The DATABASE_URL in `.env.local` is a placeholder. The plan stops at `drizzle-kit generate` which produces SQL files without hitting the DB. The user will run `db:push` against their real Neon instance after Phase 2.
5. **Commit frequency:** one commit per task. Commit messages use Conventional Commits (`feat:`, `chore:`, `test:`, `docs:`).
6. **All Drizzle imports** come from `drizzle-orm/pg-core` (column types, `pgTable`, `pgEnum`). Relations come from `drizzle-orm` (not `/pg-core`).

---

## File Structure

Files to create:

```
src/server/db/
  schema/
    enums.ts                  # pgEnum definitions
    stocks.ts                 # stocks, daily_prices, fundamentals
    signals.ts                # signals, signal_rationales, signal_recommendations, signal_state_log, signal_outcomes
    users.ts                  # users, watchlists, watchlist_assessments, user_trades, alert_preferences
    simulation.ts             # simulation_snapshots
    index.ts                  # barrel export
    schema.test.ts            # smoke test — all tables + enums
  seed-data/
    universe.json             # ~30 starter tickers
  seed-parser.ts              # pure parser with zod validation
  seed-parser.test.ts         # unit tests for parser
  seed.ts                     # executable seed script
```

Files to delete:

```
src/server/db/schema.ts       # empty stub replaced by schema/ directory
```

Files to modify:

```
drizzle.config.ts             # schema path → ./src/server/db/schema
package.json                  # add "db:seed" script
CLAUDE.md                     # note schema directory split
```

Column type conventions used throughout (match PostgreSQL semantics, avoid JS number precision loss for money):

- **Money/prices** → `numeric(12, 4)` — 8 integer digits, 4 decimals. Stored as strings in JS per Drizzle default (keeps precision).
- **Ratios/percentages** (margins, ROE, growth) → `numeric(6, 4)` — e.g. `0.2345` for 23.45%.
- **Scores** (0–100) → `numeric(5, 2)`.
- **Volume / market cap / revenue** → `bigint({ mode: 'number' })` — Postgres bigint, returned as JS number. Max safe is 9.007e15, comfortable for market caps.
- **Slopes** → `numeric(12, 6)` — MA slopes can be tiny.
- **Dates** (no time component) → `date`. Timestamps → `timestamp({ withTimezone: true })`.

---

## Task 1: Delete old stub and create schema directory with enums

**Files:**

- Delete: `src/server/db/schema.ts`
- Create: `src/server/db/schema/enums.ts`

- [ ] **Step 1: Delete the empty stub**

```bash
rm src/server/db/schema.ts
```

- [ ] **Step 2: Create `src/server/db/schema/enums.ts`**

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const exchangeEnum = pgEnum('exchange', ['NYSE', 'NASDAQ', 'AMEX']);

export const signalTypeEnum = pgEnum('signal_type', [
  'SIG-01',
  'SIG-02',
  'SIG-03',
  'SIG-04',
  'SIG-05',
  'SIG-06',
  'SIG-07',
]);

export const signalStrengthEnum = pgEnum('signal_strength', ['medium', 'strong', 'very_strong']);

export const signalSourceEnum = pgEnum('signal_source', ['system', 'watchlist']);

export const recommendationStateEnum = pgEnum('recommendation_state', [
  'WATCH',
  'BUY',
  'HOLD',
  'TAKE_PARTIAL_PROFIT',
  'SELL',
  'STOP_HIT',
  'DOWNGRADED',
  'EXPIRED',
]);

export const signalOutcomeEnum = pgEnum('signal_outcome', [
  'target_hit',
  'stopped_out',
  'expired',
  'downgraded',
]);

export const userPlanEnum = pgEnum('user_plan', ['free', 'pro', 'premium']);

export const watchlistSourceEnum = pgEnum('watchlist_source', ['manual', 'signal']);

export const alertChannelEnum = pgEnum('alert_channel', ['email']);
```

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts src/server/db/schema/enums.ts
git commit -m "chore(db): replace schema stub with directory layout and enums"
```

---

## Task 2: Stocks domain (stocks, daily_prices, fundamentals)

**Files:**

- Create: `src/server/db/schema/stocks.ts`

- [ ] **Step 1: Create `src/server/db/schema/stocks.ts`**

```typescript
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
  date,
  bigint,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { exchangeEnum } from './enums';

export const stocks = pgTable(
  'stocks',
  {
    id: serial('id').primaryKey(),
    ticker: varchar('ticker', { length: 10 }).notNull().unique(),
    name: text('name').notNull(),
    exchange: exchangeEnum('exchange').notNull(),
    sector: text('sector'),
    industry: text('industry'),
    marketCap: bigint('market_cap', { mode: 'number' }),
    avgVolume: bigint('avg_volume', { mode: 'number' }),
    price: numeric('price', { precision: 12, scale: 4 }),
    listingDate: date('listing_date'),
    isEligible: boolean('is_eligible').notNull().default(false),
    lastUpdated: timestamp('last_updated', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tickerIdx: uniqueIndex('stocks_ticker_idx').on(table.ticker),
    eligibleIdx: index('stocks_eligible_idx').on(table.isEligible),
  }),
);

export const dailyPrices = pgTable(
  'daily_prices',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    open: numeric('open', { precision: 12, scale: 4 }).notNull(),
    high: numeric('high', { precision: 12, scale: 4 }).notNull(),
    low: numeric('low', { precision: 12, scale: 4 }).notNull(),
    close: numeric('close', { precision: 12, scale: 4 }).notNull(),
    volume: bigint('volume', { mode: 'number' }).notNull(),
    ma150: numeric('ma150', { precision: 12, scale: 4 }),
    ma200: numeric('ma200', { precision: 12, scale: 4 }),
    ma150Slope: numeric('ma150_slope', { precision: 12, scale: 6 }),
    ma200Slope: numeric('ma200_slope', { precision: 12, scale: 6 }),
  },
  (table) => ({
    stockDateIdx: uniqueIndex('daily_prices_stock_date_idx').on(table.stockId, table.date),
  }),
);

export const fundamentals = pgTable(
  'fundamentals',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    quarter: varchar('quarter', { length: 7 }).notNull(), // e.g. "2026Q1"
    revenue: bigint('revenue', { mode: 'number' }),
    eps: numeric('eps', { precision: 10, scale: 4 }),
    grossMargin: numeric('gross_margin', { precision: 6, scale: 4 }),
    operatingMargin: numeric('operating_margin', { precision: 6, scale: 4 }),
    netMargin: numeric('net_margin', { precision: 6, scale: 4 }),
    roe: numeric('roe', { precision: 6, scale: 4 }),
    roa: numeric('roa', { precision: 6, scale: 4 }),
    roic: numeric('roic', { precision: 6, scale: 4 }),
    revenueGrowthYoy: numeric('revenue_growth_yoy', { precision: 6, scale: 4 }),
    epsGrowth: numeric('eps_growth', { precision: 6, scale: 4 }),
    debtToEquity: numeric('debt_to_equity', { precision: 8, scale: 4 }),
    currentRatio: numeric('current_ratio', { precision: 8, scale: 4 }),
    interestCoverage: numeric('interest_coverage', { precision: 10, scale: 4 }),
    fcfYield: numeric('fcf_yield', { precision: 6, scale: 4 }),
    forwardPe: numeric('forward_pe', { precision: 10, scale: 4 }),
    pegRatio: numeric('peg_ratio', { precision: 8, scale: 4 }),
    evEbitda: numeric('ev_ebitda', { precision: 10, scale: 4 }),
    fundamentalScore: numeric('fundamental_score', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    stockQuarterIdx: uniqueIndex('fundamentals_stock_quarter_idx').on(table.stockId, table.quarter),
  }),
);
```

- [ ] **Step 2: Typecheck by running the build (will fail at barrel later — that's OK; we want tsc to validate this file compiles in isolation)**

Run:

```bash
pnpm tsc --noEmit src/server/db/schema/stocks.ts
```

Expected: no output (success). If tsc complains about missing types for the file's imports, re-read the Drizzle 0.45 type definitions and fix.

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema/stocks.ts
git commit -m "feat(db): add stocks domain schema (stocks, daily_prices, fundamentals)"
```

---

## Task 3: Signals domain (5 tables)

**Files:**

- Create: `src/server/db/schema/signals.ts`

- [ ] **Step 1: Create `src/server/db/schema/signals.ts`**

```typescript
import {
  pgTable,
  serial,
  integer,
  numeric,
  timestamp,
  boolean,
  text,
  index,
} from 'drizzle-orm/pg-core';
import { stocks } from './stocks';
import {
  signalTypeEnum,
  signalStrengthEnum,
  signalSourceEnum,
  recommendationStateEnum,
  signalOutcomeEnum,
} from './enums';

export const signals = pgTable(
  'signals',
  {
    id: serial('id').primaryKey(),
    stockId: integer('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    signalType: signalTypeEnum('signal_type').notNull(),
    strength: signalStrengthEnum('strength').notNull(),
    volumeConfirmed: boolean('volume_confirmed').notNull(),
    fundamentalScore: numeric('fundamental_score', { precision: 5, scale: 2 }),
    signalScore: numeric('signal_score', { precision: 5, scale: 2 }),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull(),
    source: signalSourceEnum('source').notNull().default('system'),
  },
  (table) => ({
    stockIdx: index('signals_stock_idx').on(table.stockId),
    triggeredIdx: index('signals_triggered_idx').on(table.triggeredAt),
  }),
);

export const signalRationales = pgTable('signal_rationales', {
  id: serial('id').primaryKey(),
  signalId: integer('signal_id')
    .notNull()
    .references(() => signals.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  fundamentalThesis: text('fundamental_thesis'),
  technicalContext: text('technical_context'),
  targetPrice: numeric('target_price', { precision: 12, scale: 4 }),
  stopLoss: numeric('stop_loss', { precision: 12, scale: 4 }),
  riskReward: numeric('risk_reward', { precision: 6, scale: 2 }),
  confidence: text('confidence'), // "Low" | "Medium" | "High"
  strategyNote: text('strategy_note'),
  disclaimer: text('disclaimer').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const signalRecommendations = pgTable(
  'signal_recommendations',
  {
    id: serial('id').primaryKey(),
    signalId: integer('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),
    state: recommendationStateEnum('state').notNull(),
    previousState: recommendationStateEnum('previous_state'),
    targetPrice: numeric('target_price', { precision: 12, scale: 4 }),
    stopLoss: numeric('stop_loss', { precision: 12, scale: 4 }),
    trailingStop: numeric('trailing_stop', { precision: 12, scale: 4 }),
    aiUpdateText: text('ai_update_text'),
    transitionedAt: timestamp('transitioned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    signalStateIdx: index('signal_recommendations_signal_state_idx').on(
      table.signalId,
      table.state,
    ),
  }),
);

export const signalStateLog = pgTable(
  'signal_state_log',
  {
    id: serial('id').primaryKey(),
    signalId: integer('signal_id')
      .notNull()
      .references(() => signals.id, { onDelete: 'cascade' }),
    fromState: recommendationStateEnum('from_state'),
    toState: recommendationStateEnum('to_state').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    signalIdx: index('signal_state_log_signal_idx').on(table.signalId),
  }),
);

export const signalOutcomes = pgTable('signal_outcomes', {
  id: serial('id').primaryKey(),
  signalId: integer('signal_id')
    .notNull()
    .unique()
    .references(() => signals.id, { onDelete: 'cascade' }),
  outcome: signalOutcomeEnum('outcome').notNull(),
  entryPrice: numeric('entry_price', { precision: 12, scale: 4 }).notNull(),
  exitPrice: numeric('exit_price', { precision: 12, scale: 4 }).notNull(),
  actualReturnPct: numeric('actual_return_pct', { precision: 7, scale: 4 }).notNull(),
  daysHeld: integer('days_held').notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/db/schema/signals.ts
git commit -m "feat(db): add signals domain schema (5 tables + state log + outcomes)"
```

---

## Task 4: Users domain (users, watchlists, watchlist_assessments, user_trades, alert_preferences)

**Files:**

- Create: `src/server/db/schema/users.ts`

- [ ] **Step 1: Create `src/server/db/schema/users.ts`**

```typescript
import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  text,
  boolean,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { stocks } from './stocks';
import { signals } from './signals';
import { userPlanEnum, watchlistSourceEnum, alertChannelEnum } from './enums';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkUserId: varchar('clerk_user_id', { length: 64 }).notNull().unique(),
  plan: userPlanEnum('plan').notNull().default('free'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const watchlists = pgTable(
  'watchlists',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockId: integer('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    source: watchlistSourceEnum('source').notNull().default('manual'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('watchlists_user_idx').on(table.userId),
    userStockUnique: uniqueIndex('watchlists_user_stock_unique_idx').on(
      table.userId,
      table.stockId,
    ),
  }),
);

export const watchlistAssessments = pgTable('watchlist_assessments', {
  id: serial('id').primaryKey(),
  watchlistId: integer('watchlist_id')
    .notNull()
    .references(() => watchlists.id, { onDelete: 'cascade' }),
  status: text('status'),
  fundamentalGrade: text('fundamental_grade'),
  entryGuidance: text('entry_guidance'),
  alertConditions: text('alert_conditions'),
  risks: text('risks'),
  aiText: text('ai_text'),
  recommendation: text('recommendation'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userTrades = pgTable(
  'user_trades',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockId: integer('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    signalId: integer('signal_id').references(() => signals.id, {
      onDelete: 'set null',
    }),
    entryPrice: numeric('entry_price', { precision: 12, scale: 4 }).notNull(),
    entryDate: date('entry_date').notNull(),
    shares: numeric('shares', { precision: 14, scale: 4 }).notNull(),
    exitPrice: numeric('exit_price', { precision: 12, scale: 4 }),
    exitDate: date('exit_date'),
    realizedPnl: numeric('realized_pnl', { precision: 14, scale: 4 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('user_trades_user_idx').on(table.userId),
  }),
);

export const alertPreferences = pgTable('alert_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  channel: alertChannelEnum('channel').notNull().default('email'),
  enabled: boolean('enabled').notNull().default(true),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/db/schema/users.ts
git commit -m "feat(db): add users domain schema (users, watchlists, trades, alert prefs)"
```

---

## Task 5: Simulation domain (simulation_snapshots)

**Files:**

- Create: `src/server/db/schema/simulation.ts`

- [ ] **Step 1: Create `src/server/db/schema/simulation.ts`**

```typescript
import { pgTable, serial, date, integer, numeric } from 'drizzle-orm/pg-core';

export const simulationSnapshots = pgTable('simulation_snapshots', {
  id: serial('id').primaryKey(),
  date: date('date').notNull().unique(),
  totalSignals: integer('total_signals').notNull(),
  winRate: numeric('win_rate', { precision: 5, scale: 4 }),
  avgReturn: numeric('avg_return', { precision: 7, scale: 4 }),
  avgHoldDays: numeric('avg_hold_days', { precision: 6, scale: 2 }),
  riskRewardRatio: numeric('risk_reward_ratio', { precision: 6, scale: 2 }),
  equityValue: numeric('equity_value', { precision: 14, scale: 4 }),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/db/schema/simulation.ts
git commit -m "feat(db): add simulation_snapshots table"
```

---

## Task 6: Schema barrel and smoke test (TDD)

**Files:**

- Create: `src/server/db/schema/index.ts`
- Create: `src/server/db/schema/schema.test.ts`

- [ ] **Step 1: Write the failing smoke test first**

Create `src/server/db/schema/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as schema from './index';

describe('db schema barrel', () => {
  it('exports all 14 tables from the design spec', () => {
    const expected = [
      // stocks domain
      'stocks',
      'dailyPrices',
      'fundamentals',
      // signals domain
      'signals',
      'signalRationales',
      'signalRecommendations',
      'signalStateLog',
      'signalOutcomes',
      // users domain
      'users',
      'watchlists',
      'watchlistAssessments',
      'userTrades',
      'alertPreferences',
      // simulation domain
      'simulationSnapshots',
    ] as const;
    for (const name of expected) {
      expect(schema).toHaveProperty(name);
    }
  });

  it('signalTypeEnum covers SIG-01..SIG-07', () => {
    expect(schema.signalTypeEnum.enumValues).toEqual([
      'SIG-01',
      'SIG-02',
      'SIG-03',
      'SIG-04',
      'SIG-05',
      'SIG-06',
      'SIG-07',
    ]);
  });

  it('recommendationStateEnum covers the full FSM', () => {
    expect(schema.recommendationStateEnum.enumValues).toEqual([
      'WATCH',
      'BUY',
      'HOLD',
      'TAKE_PARTIAL_PROFIT',
      'SELL',
      'STOP_HIT',
      'DOWNGRADED',
      'EXPIRED',
    ]);
  });

  it('signalStrengthEnum matches spec values', () => {
    expect(schema.signalStrengthEnum.enumValues).toEqual(['medium', 'strong', 'very_strong']);
  });

  it('signalOutcomeEnum matches spec values', () => {
    expect(schema.signalOutcomeEnum.enumValues).toEqual([
      'target_hit',
      'stopped_out',
      'expired',
      'downgraded',
    ]);
  });

  it('userPlanEnum matches spec values', () => {
    expect(schema.userPlanEnum.enumValues).toEqual(['free', 'pro', 'premium']);
  });

  it('exchangeEnum covers US listings', () => {
    expect(schema.exchangeEnum.enumValues).toEqual(['NYSE', 'NASDAQ', 'AMEX']);
  });
});
```

- [ ] **Step 2: Run the test — expect it to FAIL because `./index` does not exist**

Run:

```bash
pnpm test:run src/server/db/schema/schema.test.ts
```

Expected: FAIL — "Cannot find module './index'" or similar resolution error.

- [ ] **Step 3: Create the barrel file**

Create `src/server/db/schema/index.ts`:

```typescript
export * from './enums';
export * from './stocks';
export * from './signals';
export * from './users';
export * from './simulation';
```

- [ ] **Step 4: Re-run the test — expect PASS**

Run:

```bash
pnpm test:run src/server/db/schema/schema.test.ts
```

Expected: `Test Files 1 passed (1)`, all 7 assertions pass. If any table is missing, go back and fix the source file (likely a typo in export name).

- [ ] **Step 5: Run the full test suite to check nothing else broke**

Run:

```bash
pnpm test:run
```

Expected: all tests pass (schema smoke test + the Phase 1 DisclaimerFooter tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema/index.ts src/server/db/schema/schema.test.ts
git commit -m "feat(db): add schema barrel with smoke test"
```

---

## Task 7: Update drizzle config and generate migration

**Files:**

- Modify: `drizzle.config.ts`

- [ ] **Step 1: Point drizzle-kit at the schema directory**

Edit `drizzle.config.ts` line 4:

```typescript
// before
  schema: './src/server/db/schema.ts',
// after
  schema: './src/server/db/schema/index.ts',
```

- [ ] **Step 2: Generate the SQL migration**

Run:

```bash
pnpm db:generate
```

Expected output: drizzle-kit prints something like `14 tables` and `9 enums` and creates a file under `drizzle/` (e.g., `drizzle/0000_<random>.sql` and `drizzle/meta/0000_snapshot.json`).

If it fails with a schema error, read the error carefully — it usually names the table and column. Fix the offending file, re-run.

- [ ] **Step 3: Sanity-check the generated SQL**

Read the generated `drizzle/0000_*.sql` file. Verify:

- 14 `CREATE TABLE` statements (count them)
- Enum types created via `CREATE TYPE ... AS ENUM (...)`
- Foreign keys reference the correct parent tables
- `daily_prices_stock_date_idx` is a unique index on `(stock_id, date)`

If anything is missing or wrong, fix the schema source file and re-run `pnpm db:generate`. Delete any stale snapshot files from aborted runs before re-generating.

- [ ] **Step 4: Verify the build still passes**

Run:

```bash
pnpm build
```

Expected: `Compiled successfully`. This gates that `src/server/db/index.ts` (which imports `./schema`) still resolves correctly.

- [ ] **Step 5: Commit**

```bash
git add drizzle.config.ts drizzle/
git commit -m "feat(db): generate initial migration for 14-table schema"
```

Note: `.gitignore` excludes `drizzle/meta/` — that's intentional per the existing rule. Only the SQL file is committed.

---

## Task 8: Seed parser with TDD

**Files:**

- Create: `src/server/db/seed-parser.ts`
- Create: `src/server/db/seed-parser.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/server/db/seed-parser.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run the tests — expect FAIL (module not found)**

Run:

```bash
pnpm test:run src/server/db/seed-parser.test.ts
```

Expected: all 7 tests fail with "Cannot find module './seed-parser'".

- [ ] **Step 3: Implement the parser**

Create `src/server/db/seed-parser.ts`:

```typescript
import { z } from 'zod';

const UniverseEntrySchema = z.object({
  ticker: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z][A-Z.]*$/, 'Ticker must be uppercase letters with optional dot'),
  name: z.string().min(1),
  exchange: z.enum(['NYSE', 'NASDAQ', 'AMEX']),
  sector: z.string().min(1),
  industry: z.string().min(1),
});

export type UniverseEntry = z.infer<typeof UniverseEntrySchema>;

export function parseUniverse(data: unknown): UniverseEntry[] {
  const entries = z.array(UniverseEntrySchema).parse(data);
  const seen = new Set<string>();
  const result: UniverseEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.ticker)) continue;
    seen.add(entry.ticker);
    result.push(entry);
  }
  return result;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run:

```bash
pnpm test:run src/server/db/seed-parser.test.ts
```

Expected: `Tests 7 passed (7)`.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/seed-parser.ts src/server/db/seed-parser.test.ts
git commit -m "feat(db): add universe seed parser with zod validation"
```

---

## Task 9: Seed data JSON (starter universe)

**Files:**

- Create: `src/server/db/seed-data/universe.json`

- [ ] **Step 1: Create the seed file with ~30 large-cap US tickers**

Create `src/server/db/seed-data/universe.json`:

```json
[
  {
    "ticker": "AAPL",
    "name": "Apple Inc.",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Consumer Electronics"
  },
  {
    "ticker": "MSFT",
    "name": "Microsoft Corporation",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Software"
  },
  {
    "ticker": "GOOGL",
    "name": "Alphabet Inc. Class A",
    "exchange": "NASDAQ",
    "sector": "Communication Services",
    "industry": "Internet Content & Information"
  },
  {
    "ticker": "AMZN",
    "name": "Amazon.com Inc.",
    "exchange": "NASDAQ",
    "sector": "Consumer Cyclical",
    "industry": "Internet Retail"
  },
  {
    "ticker": "NVDA",
    "name": "NVIDIA Corporation",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Semiconductors"
  },
  {
    "ticker": "META",
    "name": "Meta Platforms Inc.",
    "exchange": "NASDAQ",
    "sector": "Communication Services",
    "industry": "Internet Content & Information"
  },
  {
    "ticker": "TSLA",
    "name": "Tesla Inc.",
    "exchange": "NASDAQ",
    "sector": "Consumer Cyclical",
    "industry": "Auto Manufacturers"
  },
  {
    "ticker": "AVGO",
    "name": "Broadcom Inc.",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Semiconductors"
  },
  {
    "ticker": "BRK.B",
    "name": "Berkshire Hathaway Inc. Class B",
    "exchange": "NYSE",
    "sector": "Financial Services",
    "industry": "Insurance - Diversified"
  },
  {
    "ticker": "JPM",
    "name": "JPMorgan Chase & Co.",
    "exchange": "NYSE",
    "sector": "Financial Services",
    "industry": "Banks - Diversified"
  },
  {
    "ticker": "V",
    "name": "Visa Inc.",
    "exchange": "NYSE",
    "sector": "Financial Services",
    "industry": "Credit Services"
  },
  {
    "ticker": "MA",
    "name": "Mastercard Incorporated",
    "exchange": "NYSE",
    "sector": "Financial Services",
    "industry": "Credit Services"
  },
  {
    "ticker": "UNH",
    "name": "UnitedHealth Group Incorporated",
    "exchange": "NYSE",
    "sector": "Healthcare",
    "industry": "Healthcare Plans"
  },
  {
    "ticker": "LLY",
    "name": "Eli Lilly and Company",
    "exchange": "NYSE",
    "sector": "Healthcare",
    "industry": "Drug Manufacturers - General"
  },
  {
    "ticker": "JNJ",
    "name": "Johnson & Johnson",
    "exchange": "NYSE",
    "sector": "Healthcare",
    "industry": "Drug Manufacturers - General"
  },
  {
    "ticker": "XOM",
    "name": "Exxon Mobil Corporation",
    "exchange": "NYSE",
    "sector": "Energy",
    "industry": "Oil & Gas Integrated"
  },
  {
    "ticker": "CVX",
    "name": "Chevron Corporation",
    "exchange": "NYSE",
    "sector": "Energy",
    "industry": "Oil & Gas Integrated"
  },
  {
    "ticker": "WMT",
    "name": "Walmart Inc.",
    "exchange": "NYSE",
    "sector": "Consumer Defensive",
    "industry": "Discount Stores"
  },
  {
    "ticker": "PG",
    "name": "Procter & Gamble Company",
    "exchange": "NYSE",
    "sector": "Consumer Defensive",
    "industry": "Household & Personal Products"
  },
  {
    "ticker": "KO",
    "name": "Coca-Cola Company",
    "exchange": "NYSE",
    "sector": "Consumer Defensive",
    "industry": "Beverages - Non-Alcoholic"
  },
  {
    "ticker": "PEP",
    "name": "PepsiCo Inc.",
    "exchange": "NASDAQ",
    "sector": "Consumer Defensive",
    "industry": "Beverages - Non-Alcoholic"
  },
  {
    "ticker": "COST",
    "name": "Costco Wholesale Corporation",
    "exchange": "NASDAQ",
    "sector": "Consumer Defensive",
    "industry": "Discount Stores"
  },
  {
    "ticker": "HD",
    "name": "Home Depot Inc.",
    "exchange": "NYSE",
    "sector": "Consumer Cyclical",
    "industry": "Home Improvement Retail"
  },
  {
    "ticker": "ORCL",
    "name": "Oracle Corporation",
    "exchange": "NYSE",
    "sector": "Technology",
    "industry": "Software - Infrastructure"
  },
  {
    "ticker": "CRM",
    "name": "Salesforce Inc.",
    "exchange": "NYSE",
    "sector": "Technology",
    "industry": "Software - Application"
  },
  {
    "ticker": "ADBE",
    "name": "Adobe Inc.",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Software - Infrastructure"
  },
  {
    "ticker": "NFLX",
    "name": "Netflix Inc.",
    "exchange": "NASDAQ",
    "sector": "Communication Services",
    "industry": "Entertainment"
  },
  {
    "ticker": "AMD",
    "name": "Advanced Micro Devices Inc.",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Semiconductors"
  },
  {
    "ticker": "INTC",
    "name": "Intel Corporation",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Semiconductors"
  },
  {
    "ticker": "DIS",
    "name": "Walt Disney Company",
    "exchange": "NYSE",
    "sector": "Communication Services",
    "industry": "Entertainment"
  }
]
```

- [ ] **Step 2: Add a parser test that loads the real file**

Append to `src/server/db/seed-parser.test.ts` inside the existing `describe` block:

```typescript
it('loads the committed starter universe successfully', async () => {
  const mod = await import('./seed-data/universe.json');
  const universe = mod.default;
  const parsed = parseUniverse(universe);
  expect(parsed.length).toBeGreaterThanOrEqual(30);
  expect(parsed.every((e) => ['NYSE', 'NASDAQ', 'AMEX'].includes(e.exchange))).toBe(true);
});
```

Note: JSON imports require `"resolveJsonModule": true` in `tsconfig.json`. It is already enabled in Next.js projects by default but verify by grepping `tsconfig.json`. If missing, add it.

- [ ] **Step 3: Verify tsconfig supports JSON imports**

Check `tsconfig.json` for `"resolveJsonModule": true`. Next.js's default tsconfig includes it. If absent, add it under `"compilerOptions"`.

- [ ] **Step 4: Run tests — expect PASS (8 tests now)**

Run:

```bash
pnpm test:run src/server/db/seed-parser.test.ts
```

Expected: `Tests 8 passed (8)`.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/seed-data/universe.json src/server/db/seed-parser.test.ts
git commit -m "feat(db): add starter universe seed data (30 large-cap tickers)"
```

---

## Task 10: Executable seed script

**Files:**

- Create: `src/server/db/seed.ts`

- [ ] **Step 1: Create `src/server/db/seed.ts`**

```typescript
/**
 * Seed script — loads the starter stock universe into the `stocks` table.
 *
 * Run with: `pnpm db:seed`
 *
 * Idempotent via ON CONFLICT DO NOTHING on ticker. Safe to re-run.
 * Phase 3 will extend this with FMP-fetched universe data.
 */
import { db } from './index';
import { stocks } from './schema';
import { parseUniverse } from './seed-parser';
import universeData from './seed-data/universe.json';

async function main() {
  console.log('Parsing seed universe...');
  const rows = parseUniverse(universeData);
  console.log(`Validated ${rows.length} entries.`);

  console.log('Inserting into stocks...');
  const inserted = await db
    .insert(stocks)
    .values(
      rows.map((r) => ({
        ticker: r.ticker,
        name: r.name,
        exchange: r.exchange,
        sector: r.sector,
        industry: r.industry,
      })),
    )
    .onConflictDoNothing({ target: stocks.ticker })
    .returning({ id: stocks.id, ticker: stocks.ticker });

  console.log(
    `Seed complete. Inserted ${inserted.length} new rows (${rows.length - inserted.length} already existed).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
```

- [ ] **Step 2: Typecheck the file**

Run:

```bash
pnpm tsc --noEmit
```

Expected: no errors. If `exchangeEnum` type complains about `r.exchange` being `string`, that's because zod returns a union type — the Drizzle insert should accept it since zod already narrows to `'NYSE' | 'NASDAQ' | 'AMEX'`. If there's a mismatch, the fix is in `seed-parser.ts`: `exchange: z.enum([...])` produces the right narrow type.

- [ ] **Step 3: Commit**

```bash
git add src/server/db/seed.ts
git commit -m "feat(db): add executable seed script for starter universe"
```

Note: The script will not be executed in this plan because `DATABASE_URL` is a placeholder. Actual seeding happens after the user provisions a Neon DB and runs `pnpm db:push && pnpm db:seed`.

---

## Task 11: Wire up `db:seed` npm script

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add the seed script**

Edit `package.json`. In the `"scripts"` object, add a `db:seed` entry after `db:studio`:

```json
"db:seed": "tsx src/server/db/seed.ts"
```

Then check if `tsx` is already installed (grep `package.json` devDependencies for `tsx`). If not, add it:

```bash
pnpm add -D tsx
```

Note: If the project already uses a different ts-runner (e.g., `ts-node`, `bun`, or if Next.js has a built-in loader), use that instead. Check existing scripts in `package.json` for precedent. As of Phase 1 end, no ts-runner is installed, so `tsx` is the pragmatic choice.

- [ ] **Step 2: Dry-run the seed script without a live DB to verify it compiles and reaches the DB call**

Run:

```bash
pnpm tsc --noEmit src/server/db/seed.ts
```

Expected: no errors. Do NOT run `pnpm db:seed` — it would fail against the placeholder DATABASE_URL and pollute logs. The plan explicitly defers execution to the user.

- [ ] **Step 3: Verify lint and format**

Run:

```bash
pnpm format
pnpm lint
pnpm test:run
pnpm build
```

Expected: all clean. `pnpm test:run` should now report ~10+ tests passing (DisclaimerFooter + schema smoke + seed-parser).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(db): add db:seed script with tsx runner"
```

---

## Task 12: Document Phase 2 in CLAUDE.md and push

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Find the "Running Locally" section (line 69 in the current CLAUDE.md) and add a line after `pnpm db:studio`:

```
pnpm db:seed          # load starter universe (after db:push)
```

Also, in the "Project Structure" block (around line 24), update the `server/db/` line to reflect the new layout:

```
  server/
    db/
      schema/       Drizzle tables split by domain (stocks, signals, users, simulation)
      seed-data/    Static seed JSON
      seed.ts       Seeding script
      seed-parser.ts, seed-parser.test.ts
```

- [ ] **Step 2: Final verification gate**

Run all checks in sequence:

```bash
pnpm format:check && pnpm lint && pnpm test:run && pnpm build
```

Expected: all four pass. If format:check fails, run `pnpm format` and re-commit.

- [ ] **Step 3: Commit docs**

```bash
git add CLAUDE.md
git commit -m "docs: document Phase 2 schema layout and db:seed command"
```

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

Expected: push succeeds to `itamar-rotem/signal-stocks`.

---

## Phase 2 Completion Criteria

- [x] All 14 tables from design spec Section 3 defined in Drizzle
- [x] 9 pgEnums match spec values exactly (verified by `schema.test.ts`)
- [x] Migration SQL generated under `drizzle/` and committed
- [x] Seed parser has 8 passing unit tests
- [x] Seed script compiles and is runnable via `pnpm db:seed`
- [x] `pnpm format:check && pnpm lint && pnpm test:run && pnpm build` all clean
- [x] All work pushed to `itamar-rotem/signal-stocks` main branch

After the user runs `pnpm db:push && pnpm db:seed` against a real Neon instance, Phase 3 (Market Data Ingestion) can begin. Phase 3 will add the FMP client, extend the seed universe from FMP's stock list endpoint, and populate `daily_prices` + compute MAs.

---

## Out of Scope for Phase 2 (Deferred)

- **Drizzle relations helpers** (`relations()` from `drizzle-orm`) — not strictly needed for migrations. Add in Phase 3 when the first query needs joins.
- **Database integration tests** — the smoke test covers schema shape. End-to-end DB tests need a test DB; deferred to Phase 3 when there's actual data flow.
- **FMP-sourced universe** — the starter JSON is the bootstrap. Phase 3 replaces it with a live FMP fetch.
- **Seed script for other tables** (users, signals, etc.) — only `stocks` is seeded. Other tables are populated organically by the pipeline and by user actions.
