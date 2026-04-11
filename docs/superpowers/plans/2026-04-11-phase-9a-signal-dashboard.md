# Phase 9a — Signal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the operator a read-only UI for the signals, recommendations, and AI rationale produced by Phases 3–7. Visit `/dashboard/signals` → see a list of recent active signals as cards (ticker, name, signal type, strength, state badge, target/stop, score). Click a card → go to `/stock/[ticker]` → see full signal details, the current recommendation state, and the latest AI rationale.

**Architecture:** tRPC v11 server + `@tanstack/react-query` v5 on the client. Routers live in `src/server/trpc/routers/`. The App Router exposes a single fetch-adapter handler at `src/app/api/trpc/[trpc]/route.ts`. Client components use the tRPC React client wrapped in `src/trpc/client.tsx`. Server components (signal list, signal detail) use the server-side caller from `src/trpc/server.ts`.

**Tech Stack:** tRPC v11, `@tanstack/react-query` v5, `superjson`, Drizzle, Vitest, shadcn/ui Card + Badge.

## Out of Scope (deferred)

- **Charts** — Lightweight Charts wrapper is Phase 9b
- **Watchlist** — Phase 10
- **Trade log / portfolio** — Phase 11
- **Performance simulator** — Phase 12
- **Real-time / WebSocket** — never
- **Mutations** — Phase 9a is read-only. No router mutations in this phase.

---

## Context You Need Before Starting

1. The app uses **Clerk** for auth. `/dashboard/*` is already protected via `middleware.ts`. `/stock/[ticker]` will also be protected — place it inside `src/app/(auth)/`.
2. Existing schema is in `src/server/db/schema/{stocks,signals,users,simulation}.ts`. The Drizzle client is `import { db } from '@/server/db'`. Numeric columns are returned as **strings** — convert with `Number(x)` at the boundary.
3. The project uses **Tailwind v4** (no `tailwind.config.js`; theme is in `src/app/globals.css`). shadcn `base-nova` preset is in use. `Button` does NOT support `asChild` — wrap `<Button>` inside `<Link>` manually.
4. `@clerk/nextjs` v7 does NOT export `SignedIn` / `SignedOut` — use the `useAuth()` hook if you need conditional rendering.
5. Path alias `@/*` → `src/*`. Test files co-located (`foo.ts` + `foo.test.ts`).
6. There is already a `src/app/(auth)/dashboard/page.tsx` placeholder. It will be replaced in this phase.
7. **Phase 9a is read-only.** Do not write any mutations or DB writes. The orchestrators already exist.
8. **Empty-state handling is mandatory.** A fresh clone with no seed / no FMP run has zero signals. Every page must render cleanly with zero rows.
9. **No live DB calls in tests.** Router unit tests take a mocked db client or pure-function helpers. Do not spin up a real Postgres or Neon for tests.
10. **Branch:** `main`. Commit per task.

---

## File Structure

New files:

```
src/server/trpc/
  trpc.ts                      # initTRPC, context factory
  context.ts                   # createContext (takes Clerk userId from req)
  root.ts                      # appRouter aggregate
  routers/
    signals.ts                 # list, byTicker
    signals.test.ts            # unit tests for pure helpers

src/trpc/
  client.tsx                   # TRPCProvider (client component, wraps QueryClient)
  server.ts                    # server-side RSC caller (using cache())
  shared.ts                    # transformer + react-query defaults

src/app/api/trpc/[trpc]/
  route.ts                     # fetchRequestHandler → appRouter

src/app/(auth)/
  dashboard/
    layout.tsx                 # wraps children with TRPCProvider + SiteNav
    page.tsx                   # REPLACE — redirects to /dashboard/signals
    signals/
      page.tsx                 # RSC — fetches recent signals, renders grid
    watchlist/
      page.tsx                 # placeholder "Phase 10"
    trades/
      page.tsx                 # placeholder "Phase 11"
  stock/
    [ticker]/
      page.tsx                 # RSC — signal detail, state, rationale

src/components/signals/
  signal-card.tsx              # client component (row click → Link)
  recommendation-state-badge.tsx
  recommendation-state-badge.test.ts
  rationale-card.tsx
  signal-type-label.ts
  signal-type-label.test.ts
  empty-state.tsx

src/components/ui/
  badge.tsx                    # shadcn badge primitive (new)
```

Modified files:

```
package.json                   # add tRPC + react-query + superjson deps + no scripts
CLAUDE.md                      # document Phase 9a + tRPC layout
src/components/layout/site-nav.tsx   # add Signals / Watchlist / Trades tabs
```

---

## Dependency Install

Packages to add (exact versions — do not omit or substitute):

```
pnpm add @trpc/server@^11.7.0 @trpc/client@^11.7.0 @trpc/react-query@^11.7.0 @trpc/next@^11.7.0 @tanstack/react-query@^5.67.0 superjson@^2.2.2
```

(Use the latest v11 / v5 tags if install fails; the plan does not hard-pin.)

---

## Task 1: Install dependencies + shadcn badge primitive

**Files:**

- Modify: `package.json`
- Create: `src/components/ui/badge.tsx`

- [ ] **Step 1: Install tRPC / react-query / superjson**

```bash
pnpm add @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query superjson
```

Verify `package.json` now contains all six packages. If `@trpc/next` fails to install (it's sometimes optional with v11), drop it and continue with the other five.

- [ ] **Step 2: Create `src/components/ui/badge.tsx`** (shadcn base-nova-compatible)

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-emerald-600 text-white',
        warning: 'border-transparent bg-amber-500 text-white',
        info: 'border-transparent bg-sky-600 text-white',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

If `@/lib/utils` does not yet exist, create it:

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

(Skip the `utils.ts` creation if the file already exists.)

- [ ] **Step 3: Typecheck + build**

```bash
pnpm tsc --noEmit
pnpm build
```

Both must pass.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/badge.tsx src/lib/utils.ts
git commit -m "feat(ui): install tRPC + react-query + superjson, add Badge primitive"
```

---

## Task 2: tRPC server core (trpc init + context + root router)

**Files:**

- Create: `src/server/trpc/trpc.ts`
- Create: `src/server/trpc/context.ts`
- Create: `src/server/trpc/root.ts`

- [ ] **Step 1: Create `src/server/trpc/context.ts`**

```typescript
import { auth } from '@clerk/nextjs/server';

export async function createContext() {
  const { userId } = await auth();
  return { userId };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

- [ ] **Step 2: Create `src/server/trpc/trpc.ts`**

```typescript
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape }) => shape,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
```

- [ ] **Step 3: Create `src/server/trpc/root.ts`**

```typescript
import { router } from './trpc';
import { signalsRouter } from './routers/signals';

export const appRouter = router({
  signals: signalsRouter,
});

export type AppRouter = typeof appRouter;
```

This file imports from `./routers/signals` which does not exist yet — typecheck will fail. The next task fixes it. Do NOT run typecheck after this task; do it after Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/trpc.ts src/server/trpc/context.ts src/server/trpc/root.ts
git commit -m "feat(trpc): add trpc init, context, and app router shell"
```

---

## Task 3: Signals router (TDD on pure helpers)

**Files:**

- Create: `src/server/trpc/routers/signals.ts`
- Create: `src/server/trpc/routers/signals.test.ts`

The router exposes two queries:

- `signals.list({ limit = 20 })` — returns the most recent signals (by `triggered_at DESC`) joined with stock info, recommendation state, and signal rationale summary. Excludes terminal states (SELL, STOP_HIT, EXPIRED).
- `signals.byTicker({ ticker })` — returns **all** signals for a ticker (terminal + active), each with its recommendation row and rationale.

Both are `publicProcedure` (dashboard is Clerk-protected at middleware level; additional auth enforcement isn't needed for read-only).

### Pure helper under test

Both queries need to transform Drizzle's `numeric` strings into numbers and collapse the join result into a nested shape. Extract this into a pure function so it can be unit-tested without a database.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { transformSignalRow, type SignalJoinRow } from './signals';

describe('transformSignalRow', () => {
  it('maps numeric strings to numbers and nests the shape', () => {
    const row: SignalJoinRow = {
      signalId: 42,
      signalType: 'SIG-02',
      strength: 'strong',
      volumeConfirmed: true,
      fundamentalScore: '78.50',
      signalScore: '82.00',
      triggeredAt: new Date('2026-04-10T14:30:00Z'),
      stockId: 7,
      ticker: 'AAPL',
      name: 'Apple Inc.',
      sector: 'Technology',
      lastPrice: '175.2500',
      recState: 'HOLD',
      recTargetPrice: '195.0000',
      recStopLoss: '168.0000',
      recTrailingStop: null,
      recTransitionedAt: new Date('2026-04-10T15:00:00Z'),
      rationaleSummary: 'Quality earnings + MA200 breakout',
      rationaleConfidence: 'High',
    };

    const out = transformSignalRow(row);

    expect(out.signalId).toBe(42);
    expect(out.signalType).toBe('SIG-02');
    expect(out.fundamentalScore).toBe(78.5);
    expect(out.signalScore).toBe(82);
    expect(out.stock.ticker).toBe('AAPL');
    expect(out.stock.lastPrice).toBe(175.25);
    expect(out.recommendation?.state).toBe('HOLD');
    expect(out.recommendation?.targetPrice).toBe(195);
    expect(out.recommendation?.stopLoss).toBe(168);
    expect(out.recommendation?.trailingStop).toBeNull();
    expect(out.rationale?.summary).toBe('Quality earnings + MA200 breakout');
    expect(out.rationale?.confidence).toBe('High');
  });

  it('returns null recommendation and rationale when absent', () => {
    const row: SignalJoinRow = {
      signalId: 1,
      signalType: 'SIG-01',
      strength: 'medium',
      volumeConfirmed: false,
      fundamentalScore: null,
      signalScore: null,
      triggeredAt: new Date('2026-04-10T14:30:00Z'),
      stockId: 1,
      ticker: 'MSFT',
      name: 'Microsoft',
      sector: 'Technology',
      lastPrice: null,
      recState: null,
      recTargetPrice: null,
      recStopLoss: null,
      recTrailingStop: null,
      recTransitionedAt: null,
      rationaleSummary: null,
      rationaleConfidence: null,
    };
    const out = transformSignalRow(row);
    expect(out.recommendation).toBeNull();
    expect(out.rationale).toBeNull();
    expect(out.fundamentalScore).toBeNull();
    expect(out.stock.lastPrice).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run src/server/trpc/routers/signals.test.ts
```

- [ ] **Step 3: Implement `src/server/trpc/routers/signals.ts`**

```typescript
import { z } from 'zod';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { signals, signalRecommendations, signalRationales, stocks } from '@/server/db/schema';
import { router, publicProcedure } from '../trpc';

export interface SignalJoinRow {
  signalId: number;
  signalType: string;
  strength: string;
  volumeConfirmed: boolean;
  fundamentalScore: string | null;
  signalScore: string | null;
  triggeredAt: Date;
  stockId: number;
  ticker: string;
  name: string;
  sector: string | null;
  lastPrice: string | null;
  recState: string | null;
  recTargetPrice: string | null;
  recStopLoss: string | null;
  recTrailingStop: string | null;
  recTransitionedAt: Date | null;
  rationaleSummary: string | null;
  rationaleConfidence: string | null;
}

export interface SignalViewModel {
  signalId: number;
  signalType: string;
  strength: string;
  volumeConfirmed: boolean;
  fundamentalScore: number | null;
  signalScore: number | null;
  triggeredAt: Date;
  stock: {
    id: number;
    ticker: string;
    name: string;
    sector: string | null;
    lastPrice: number | null;
  };
  recommendation: {
    state: string;
    targetPrice: number | null;
    stopLoss: number | null;
    trailingStop: number | null;
    transitionedAt: Date;
  } | null;
  rationale: {
    summary: string;
    confidence: string | null;
  } | null;
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function transformSignalRow(row: SignalJoinRow): SignalViewModel {
  return {
    signalId: row.signalId,
    signalType: row.signalType,
    strength: row.strength,
    volumeConfirmed: row.volumeConfirmed,
    fundamentalScore: toNumber(row.fundamentalScore),
    signalScore: toNumber(row.signalScore),
    triggeredAt: row.triggeredAt,
    stock: {
      id: row.stockId,
      ticker: row.ticker,
      name: row.name,
      sector: row.sector,
      lastPrice: toNumber(row.lastPrice),
    },
    recommendation:
      row.recState && row.recTransitionedAt
        ? {
            state: row.recState,
            targetPrice: toNumber(row.recTargetPrice),
            stopLoss: toNumber(row.recStopLoss),
            trailingStop: toNumber(row.recTrailingStop),
            transitionedAt: row.recTransitionedAt,
          }
        : null,
    rationale:
      row.rationaleSummary !== null
        ? {
            summary: row.rationaleSummary,
            confidence: row.rationaleConfidence,
          }
        : null,
  };
}

const TERMINAL: ('SELL' | 'STOP_HIT' | 'EXPIRED')[] = ['SELL', 'STOP_HIT', 'EXPIRED'];

const signalSelect = {
  signalId: signals.id,
  signalType: signals.signalType,
  strength: signals.strength,
  volumeConfirmed: signals.volumeConfirmed,
  fundamentalScore: signals.fundamentalScore,
  signalScore: signals.signalScore,
  triggeredAt: signals.triggeredAt,
  stockId: stocks.id,
  ticker: stocks.ticker,
  name: stocks.name,
  sector: stocks.sector,
  lastPrice: stocks.price,
  recState: signalRecommendations.state,
  recTargetPrice: signalRecommendations.targetPrice,
  recStopLoss: signalRecommendations.stopLoss,
  recTrailingStop: signalRecommendations.trailingStop,
  recTransitionedAt: signalRecommendations.transitionedAt,
  rationaleSummary: signalRationales.summary,
  rationaleConfidence: signalRationales.confidence,
} as const;

export const signalsRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const rows = await db
        .select(signalSelect)
        .from(signals)
        .innerJoin(stocks, eq(stocks.id, signals.stockId))
        .leftJoin(signalRecommendations, eq(signalRecommendations.signalId, signals.id))
        .leftJoin(signalRationales, eq(signalRationales.signalId, signals.id))
        .where(
          // either no recommendation yet OR rec not in terminal
          notInArray(signalRecommendations.state, TERMINAL),
        )
        .orderBy(desc(signals.triggeredAt))
        .limit(limit);

      return rows.map((r) => transformSignalRow(r as SignalJoinRow));
    }),

  byTicker: publicProcedure
    .input(z.object({ ticker: z.string().min(1).max(10) }))
    .query(async ({ input }) => {
      const ticker = input.ticker.toUpperCase();
      const rows = await db
        .select(signalSelect)
        .from(signals)
        .innerJoin(stocks, eq(stocks.id, signals.stockId))
        .leftJoin(signalRecommendations, eq(signalRecommendations.signalId, signals.id))
        .leftJoin(signalRationales, eq(signalRationales.signalId, signals.id))
        .where(eq(stocks.ticker, ticker))
        .orderBy(desc(signals.triggeredAt));

      const vms = rows.map((r) => transformSignalRow(r as SignalJoinRow));
      if (vms.length === 0) return null;
      return {
        stock: vms[0].stock,
        signals: vms,
      };
    }),
});
```

Note the `notInArray` clause with a `leftJoin` — in SQL this will exclude rows where there's no recommendation at all, which we DO want to show (new signals). Fix by wrapping with an `or`:

```typescript
import { and, desc, eq, isNull, notInArray, or } from 'drizzle-orm';
// …
.where(
  or(
    isNull(signalRecommendations.id),
    notInArray(signalRecommendations.state, TERMINAL),
  ),
)
```

Use that corrected `where` clause in `list`. (The code above is the full final shape — write it with the `or(isNull(...), notInArray(...))` already in place.)

- [ ] **Step 4: Run test — expect 2 PASS**

```bash
pnpm vitest run src/server/trpc/routers/signals.test.ts
```

- [ ] **Step 5: Typecheck the whole project**

```bash
pnpm tsc --noEmit
```

Must be clean. The router file imports from `@/server/db/schema` — verify the barrel `src/server/db/schema/index.ts` re-exports `signals`, `signalRecommendations`, `signalRationales`, `stocks`.

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/signals.ts src/server/trpc/routers/signals.test.ts
git commit -m "feat(trpc): add signals.list and signals.byTicker queries"
```

---

## Task 4: tRPC client scaffold (RSC caller + client provider + fetch handler)

**Files:**

- Create: `src/trpc/shared.ts`
- Create: `src/trpc/client.tsx`
- Create: `src/trpc/server.ts`
- Create: `src/app/api/trpc/[trpc]/route.ts`

- [ ] **Step 1: `src/trpc/shared.ts`**

```typescript
import superjson from 'superjson';
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
```

- [ ] **Step 2: `src/trpc/client.tsx`** (client component wrapper)

```tsx
'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import superjson from 'superjson';
import type { AppRouter } from '@/server/trpc/root';
import { makeQueryClient } from './shared';

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

- [ ] **Step 3: `src/trpc/server.ts`** (RSC caller)

```typescript
import 'server-only';
import { cache } from 'react';
import { createContext } from '@/server/trpc/context';
import { appRouter } from '@/server/trpc/root';

const getServerContext = cache(() => createContext());

export const serverTrpc = cache(async () => {
  const ctx = await getServerContext();
  return appRouter.createCaller(ctx);
});
```

- [ ] **Step 4: `src/app/api/trpc/[trpc]/route.ts`**

```typescript
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from '@/server/trpc/context';
import { appRouter } from '@/server/trpc/root';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  });

export const GET = handler;
export const POST = handler;
```

- [ ] **Step 5: Typecheck + build**

```bash
pnpm tsc --noEmit
pnpm build
```

Both must pass. If the build warns about the `api/trpc` route being dynamic, that's expected — tRPC routes are always dynamic.

- [ ] **Step 6: Commit**

```bash
git add src/trpc/shared.ts src/trpc/client.tsx src/trpc/server.ts src/app/api/trpc/
git commit -m "feat(trpc): add RSC caller, client provider, and fetch route handler"
```

---

## Task 5: Recommendation state badge (TDD)

**Files:**

- Create: `src/components/signals/recommendation-state-badge.tsx`
- Create: `src/components/signals/recommendation-state-badge.test.ts`

- [ ] **Step 1: Failing test** for the pure color-mapping function

```typescript
import { describe, it, expect } from 'vitest';
import { stateBadgeVariant, stateBadgeLabel } from './recommendation-state-badge';

describe('stateBadgeVariant', () => {
  it('maps each state to a badge variant', () => {
    expect(stateBadgeVariant('WATCH')).toBe('warning');
    expect(stateBadgeVariant('BUY')).toBe('success');
    expect(stateBadgeVariant('HOLD')).toBe('info');
    expect(stateBadgeVariant('TAKE_PARTIAL_PROFIT')).toBe('info');
    expect(stateBadgeVariant('SELL')).toBe('success');
    expect(stateBadgeVariant('STOP_HIT')).toBe('destructive');
    expect(stateBadgeVariant('DOWNGRADED')).toBe('warning');
    expect(stateBadgeVariant('EXPIRED')).toBe('muted');
  });

  it('handles null/unknown as muted', () => {
    expect(stateBadgeVariant(null)).toBe('muted');
    expect(stateBadgeVariant('UNKNOWN')).toBe('muted');
  });
});

describe('stateBadgeLabel', () => {
  it('humanises underscored states', () => {
    expect(stateBadgeLabel('TAKE_PARTIAL_PROFIT')).toBe('Take Partial Profit');
    expect(stateBadgeLabel('STOP_HIT')).toBe('Stop Hit');
    expect(stateBadgeLabel('WATCH')).toBe('Watch');
  });

  it('returns "—" for null', () => {
    expect(stateBadgeLabel(null)).toBe('—');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```tsx
import { Badge, type BadgeProps } from '@/components/ui/badge';

type Variant = NonNullable<BadgeProps['variant']>;

export function stateBadgeVariant(state: string | null): Variant {
  switch (state) {
    case 'BUY':
    case 'SELL':
      return 'success';
    case 'HOLD':
    case 'TAKE_PARTIAL_PROFIT':
      return 'info';
    case 'WATCH':
    case 'DOWNGRADED':
      return 'warning';
    case 'STOP_HIT':
      return 'destructive';
    case 'EXPIRED':
      return 'muted';
    default:
      return 'muted';
  }
}

export function stateBadgeLabel(state: string | null): string {
  if (state === null) return '—';
  return state
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export function RecommendationStateBadge({ state }: { state: string | null }) {
  return <Badge variant={stateBadgeVariant(state)}>{stateBadgeLabel(state)}</Badge>;
}
```

- [ ] **Step 4: Run — expect 10 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/signals/recommendation-state-badge.tsx src/components/signals/recommendation-state-badge.test.ts
git commit -m "feat(signals): add RecommendationStateBadge with tested variant mapping"
```

---

## Task 6: Signal type label helper (TDD)

**Files:**

- Create: `src/components/signals/signal-type-label.ts`
- Create: `src/components/signals/signal-type-label.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { signalTypeLabel } from './signal-type-label';

describe('signalTypeLabel', () => {
  it('maps each signal code to a human label', () => {
    expect(signalTypeLabel('SIG-01')).toBe('MA200 Approaching');
    expect(signalTypeLabel('SIG-02')).toBe('MA200 Breakout');
    expect(signalTypeLabel('SIG-03')).toBe('MA150 Approaching');
    expect(signalTypeLabel('SIG-04')).toBe('MA150 Breakout');
    expect(signalTypeLabel('SIG-05')).toBe('Dual MA Breakout');
    expect(signalTypeLabel('SIG-06')).toBe('Golden Cross');
    expect(signalTypeLabel('SIG-07')).toBe('Support Bounce');
  });

  it('passes through unknown codes', () => {
    expect(signalTypeLabel('SIG-99')).toBe('SIG-99');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
const LABELS: Record<string, string> = {
  'SIG-01': 'MA200 Approaching',
  'SIG-02': 'MA200 Breakout',
  'SIG-03': 'MA150 Approaching',
  'SIG-04': 'MA150 Breakout',
  'SIG-05': 'Dual MA Breakout',
  'SIG-06': 'Golden Cross',
  'SIG-07': 'Support Bounce',
};

export function signalTypeLabel(code: string): string {
  return LABELS[code] ?? code;
}
```

- [ ] **Step 4: Run — expect 2 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/signals/signal-type-label.ts src/components/signals/signal-type-label.test.ts
git commit -m "feat(signals): add signalTypeLabel mapping helper"
```

---

## Task 7: SignalCard + RationaleCard + EmptyState components

**Files:**

- Create: `src/components/signals/signal-card.tsx`
- Create: `src/components/signals/rationale-card.tsx`
- Create: `src/components/signals/empty-state.tsx`

These are thin presentational components. No tests — they're trivial and render-only.

- [ ] **Step 1: `src/components/signals/signal-card.tsx`**

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecommendationStateBadge } from './recommendation-state-badge';
import { signalTypeLabel } from './signal-type-label';

interface SignalCardProps {
  ticker: string;
  name: string;
  sector: string | null;
  signalType: string;
  strength: string;
  volumeConfirmed: boolean;
  signalScore: number | null;
  fundamentalScore: number | null;
  lastPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  state: string | null;
  triggeredAt: Date;
}

function fmtPrice(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
}

function fmtScore(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(0);
}

export function SignalCard(props: SignalCardProps) {
  return (
    <Link href={`/stock/${props.ticker}`} className="block transition-shadow hover:shadow-md">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-lg">{props.ticker}</CardTitle>
              <p className="text-muted-foreground text-xs">{props.name}</p>
              {props.sector && <p className="text-muted-foreground text-xs">{props.sector}</p>}
            </div>
            <RecommendationStateBadge state={props.state} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{signalTypeLabel(props.signalType)}</Badge>
            <Badge variant={props.strength === 'very_strong' ? 'success' : 'secondary'}>
              {props.strength.replace('_', ' ')}
            </Badge>
            {props.volumeConfirmed && <Badge variant="info">Volume ✓</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Signal score" value={fmtScore(props.signalScore)} />
            <Stat label="Fundamentals" value={fmtScore(props.fundamentalScore)} />
            <Stat label="Last price" value={fmtPrice(props.lastPrice)} />
            <Stat label="Target" value={fmtPrice(props.targetPrice)} />
            <Stat label="Stop" value={fmtPrice(props.stopLoss)} />
            <Stat label="Triggered" value={props.triggeredAt.toISOString().slice(0, 10)} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: `src/components/signals/rationale-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RationaleCardProps {
  summary: string;
  fundamentalThesis: string | null;
  technicalContext: string | null;
  strategyNote: string | null;
  confidence: string | null;
  disclaimer: string;
}

export function RationaleCard(props: RationaleCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>AI Rationale</CardTitle>
          {props.confidence && <Badge variant="outline">Confidence: {props.confidence}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Section label="Summary">{props.summary}</Section>
        {props.fundamentalThesis && (
          <Section label="Fundamental thesis">{props.fundamentalThesis}</Section>
        )}
        {props.technicalContext && (
          <Section label="Technical context">{props.technicalContext}</Section>
        )}
        {props.strategyNote && <Section label="Strategy note">{props.strategyNote}</Section>}
        <p className="text-muted-foreground border-t pt-3 text-xs italic">{props.disclaimer}</p>
      </CardContent>
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs font-medium uppercase">{label}</div>
      <div className="mt-1 whitespace-pre-line">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: `src/components/signals/empty-state.tsx`**

```tsx
import { Card, CardContent } from '@/components/ui/card';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/signals/signal-card.tsx src/components/signals/rationale-card.tsx src/components/signals/empty-state.tsx
git commit -m "feat(signals): add SignalCard, RationaleCard, and EmptyState components"
```

---

## Task 8: Dashboard layout + Signals page + placeholder tabs

**Files:**

- Create: `src/app/(auth)/dashboard/layout.tsx`
- Replace: `src/app/(auth)/dashboard/page.tsx`
- Create: `src/app/(auth)/dashboard/signals/page.tsx`
- Create: `src/app/(auth)/dashboard/watchlist/page.tsx`
- Create: `src/app/(auth)/dashboard/trades/page.tsx`
- Modify: `src/components/layout/site-nav.tsx`

- [ ] **Step 1: Dashboard layout wraps children with tRPC provider + nav**

```tsx
// src/app/(auth)/dashboard/layout.tsx
import { SiteNav } from '@/components/layout/site-nav';
import { TRPCProvider } from '@/trpc/client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider>
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </TRPCProvider>
  );
}
```

- [ ] **Step 2: Replace `src/app/(auth)/dashboard/page.tsx`** with a redirect

```tsx
import { redirect } from 'next/navigation';

export default function DashboardIndex() {
  redirect('/dashboard/signals');
}
```

- [ ] **Step 3: `src/app/(auth)/dashboard/signals/page.tsx`** (RSC)

```tsx
import { serverTrpc } from '@/trpc/server';
import { SignalCard } from '@/components/signals/signal-card';
import { EmptyState } from '@/components/signals/empty-state';

export const dynamic = 'force-dynamic';

export default async function SignalsPage() {
  const trpc = await serverTrpc();
  const signals = await trpc.signals.list({ limit: 20 });

  if (signals.length === 0) {
    return (
      <EmptyState
        title="No active signals yet"
        description="Run the daily pipeline (ingest → fundamentals → signals → recommendations) to populate this view."
      />
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Today&rsquo;s Signals</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {signals.map((s) => (
          <SignalCard
            key={s.signalId}
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
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `src/app/(auth)/dashboard/watchlist/page.tsx`**

```tsx
import { EmptyState } from '@/components/signals/empty-state';

export default function WatchlistPage() {
  return (
    <EmptyState
      title="Watchlist (Phase 10)"
      description="Add any stock to your personal watchlist — coming in Phase 10."
    />
  );
}
```

- [ ] **Step 5: `src/app/(auth)/dashboard/trades/page.tsx`**

```tsx
import { EmptyState } from '@/components/signals/empty-state';

export default function TradesPage() {
  return (
    <EmptyState
      title="Trade log (Phase 11)"
      description="Log your trades and track P&L — coming in Phase 11."
    />
  );
}
```

- [ ] **Step 6: Update `src/components/layout/site-nav.tsx`**

First read the existing file. Then add three `<Link>` tabs — Signals, Watchlist, Trades — that point at `/dashboard/signals`, `/dashboard/watchlist`, `/dashboard/trades`. Preserve any existing structure; add these as the primary nav. Use `usePathname()` and add `aria-current="page"` on the active tab.

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/signals', label: 'Signals' },
  { href: '/dashboard/watchlist', label: 'Watchlist' },
  { href: '/dashboard/trades', label: 'Trades' },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b">
      <div className="mx-auto flex max-w-7xl gap-6 px-4">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'border-b-2 py-3 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

(If the original file has additional content like a logo or user button, preserve it — add the tabs into the same structure.)

- [ ] **Step 7: Build**

```bash
pnpm build
```

Must succeed. The build pre-renders routes; because all `/dashboard/*` pages use Clerk auth and `serverTrpc`, they will be dynamic — that's expected.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(auth\)/dashboard/ src/components/layout/site-nav.tsx
git commit -m "feat(dashboard): add dashboard layout, signals list page, and placeholder tabs"
```

---

## Task 9: Stock detail page `/stock/[ticker]`

**Files:**

- Create: `src/app/(auth)/stock/[ticker]/page.tsx`

- [ ] **Step 1: Update middleware** — confirm `createRouteMatcher` already covers `/stock(.*)`. Open `middleware.ts` and if the matcher is only `/dashboard(.*)`, extend it to `['/dashboard(.*)', '/stock(.*)']`.

- [ ] **Step 2: Create the page**

```tsx
import { notFound } from 'next/navigation';
import { serverTrpc } from '@/trpc/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecommendationStateBadge } from '@/components/signals/recommendation-state-badge';
import { RationaleCard } from '@/components/signals/rationale-card';
import { signalTypeLabel } from '@/components/signals/signal-type-label';
import { RATIONALE_DISCLAIMER } from '@/server/services/ai/disclaimer';
import { db } from '@/server/db';
import { signalRationales } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

function fmtPrice(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
}

export default async function StockDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const trpc = await serverTrpc();
  const data = await trpc.signals.byTicker({ ticker });

  if (!data) notFound();

  // For the freshest signal, fetch the full rationale
  const freshest = data.signals[0];
  const [fullRationale] = freshest
    ? await db
        .select()
        .from(signalRationales)
        .where(eq(signalRationales.signalId, freshest.signalId))
        .limit(1)
    : [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-semibold">{data.stock.ticker}</h1>
          <p className="text-muted-foreground">{data.stock.name}</p>
        </div>
        {data.stock.sector && (
          <p className="text-muted-foreground mt-1 text-sm">{data.stock.sector}</p>
        )}
      </header>

      {fullRationale && (
        <RationaleCard
          summary={fullRationale.summary}
          fundamentalThesis={fullRationale.fundamentalThesis}
          technicalContext={fullRationale.technicalContext}
          strategyNote={fullRationale.strategyNote}
          confidence={fullRationale.confidence}
          disclaimer={fullRationale.disclaimer || RATIONALE_DISCLAIMER}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Signal History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {data.signals.map((s) => (
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
    </main>
  );
}
```

Notes on the detail page:

- It uses the RSC caller for `signals.byTicker` and then a direct `db` query for the full rationale. The router does not expose the full rationale fields — adding a dedicated `rationale.byTicker` query would be cleaner but is unnecessary given one extra query per page load.
- `/stock/[ticker]` lives under `(auth)` so Clerk gates it. Confirm `middleware.ts` matches.

- [ ] **Step 3: Typecheck + build**

```bash
pnpm tsc --noEmit
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/stock/ middleware.ts
git commit -m "feat(dashboard): add /stock/[ticker] detail page with rationale + signal history"
```

---

## Task 10: Final verification + docs + push

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Under "Project Structure", after the `ai/` line in `services/`, add nothing (already there). Under `app/`, update the `(auth)/` section to reflect new routes:

```
    (auth)/         Clerk-protected routes
      dashboard/
        signals/
        watchlist/
        trades/
      stock/[ticker]/
```

Under `server/`, add:

```
    trpc/           tRPC routers (signals)
```

(Next to the existing tRPC line — it already mentions "tRPC routers (later)". Replace "(later)" with "(signals — Phase 9a)".)

Under a new "Phase 9a" paragraph at the bottom of "Project Decisions" or "Known API Gotchas", add:

```
### tRPC v11 + Next.js 16 App Router

- Server router lives in `src/server/trpc/`. Client provider is `src/trpc/client.tsx`. RSC caller is `src/trpc/server.ts`. Fetch handler is `src/app/api/trpc/[trpc]/route.ts`.
- Queries use `superjson` transformer on both client and server.
- `serverTrpc()` from `@/trpc/server` returns an `appRouter.createCaller(ctx)` cached per request.
```

- [ ] **Step 2: Run full verification**

```bash
pnpm format
pnpm lint
pnpm test:run
pnpm build
```

All four must pass. Expected tests: 219 (Phase 7) + 2 (transformSignalRow) + 10 (state badge) + 2 (signal type label) = 233.

If `pnpm format` rewrites any plan files (they get CRLF'd on Windows), discard those with `git checkout -- docs/superpowers/plans/` before committing.

- [ ] **Step 3: Commit docs**

```bash
git add CLAUDE.md
git commit -m "docs: document Phase 9a (signal dashboard + tRPC infra)"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Phase 9a Completion Criteria

- [x] tRPC v11 server + client + fetch handler + RSC caller wired
- [x] `signals.list` and `signals.byTicker` return rich view models (tested via `transformSignalRow` pure helper)
- [x] `RecommendationStateBadge` with tested variant mapping
- [x] `signalTypeLabel` helper with tested mapping
- [x] `SignalCard`, `RationaleCard`, `EmptyState` render-only components
- [x] `/dashboard/signals` lists recent active signals (cards, responsive grid)
- [x] `/stock/[ticker]` shows signal history + rationale card
- [x] Placeholder `/dashboard/watchlist` and `/dashboard/trades` tabs
- [x] `SiteNav` highlights active tab
- [x] Empty states for "no signals yet" and unknown ticker
- [x] `pnpm build` + `pnpm test:run` + `pnpm lint` clean
- [x] Pushed to `main`

## Out of Scope (Phase 9b or later)

- Lightweight Charts wrapper (`<StockChart />`)
- tRPC mutations
- Watchlist UI + assessments
- Trade log + portfolio
- Performance simulator
- Alert preferences
- Landing page redesign
