@AGENTS.md

# SignalStocks

AI-Powered Stock Screener & Active Investing Companion.

## Tech Stack

- **Next.js 16.2.3** (App Router) + TypeScript 5 + React 19
- **Tailwind CSS v4** (no `tailwind.config.js` — uses `@theme` in `globals.css`)
- **shadcn/ui** via the `base-nova` preset (Tailwind v4 compatible, Base UI primitives instead of Radix)
- **tRPC v11** (added in a later phase)
- **Neon PostgreSQL** + **Drizzle ORM** (`@neondatabase/serverless`)
- **Clerk v7** authentication
- **Lightweight Charts** (TradingView OSS) for financial charts (later phase)
- **Anthropic Claude API** (`@anthropic-ai/sdk`) — Claude Sonnet for AI rationale generation (`AnthropicRationaleClient` in `services/ai/`)
- **Financial Modeling Prep (FMP)** for market data (later phase)
- **Inngest** for the daily pipeline (later phase)
- **Resend** for email alerts (later phase)
- **Vercel** hosting target

## Project Structure

```
src/
  app/              Next.js App Router (pages, layouts)
    (auth)/         Clerk-protected routes
      dashboard/
    sign-in/
    sign-up/
    api/            API routes + tRPC handler (later)
  server/
    db/
      schema/       Drizzle tables split by domain (stocks, signals, users, simulation)
      seed-data/    Static seed JSON (starter universe)
      seed.ts       Executable seed script (pnpm db:seed)
      seed-parser.ts, seed-parser.test.ts
      index.ts      Drizzle client
    trpc/           tRPC routers (later)
    services/
      market-data/  FMP client, MA computation, EOD ingestion, cli.ts
      fundamentals/ FMP ratios+metrics+income client, scoring, ingestion
      signals/      eligibility, detectors, composite scoring, ingestion
      ai/           Claude client, prompts, rationale generation, persistence
      ...           scoring, alerts (later phases)
    inngest/        Pipeline step functions (later)
  components/
    ui/             shadcn/ui primitives (button, card, ...)
    layout/         Header, DisclaimerFooter, SiteNav
    landing/        Hero
  lib/              Shared utilities, constants, env validation
middleware.ts       Clerk auth middleware (at project root, NOT in src/)
```

## Conventions

- TypeScript strict mode
- Path alias `@/*` → `src/*`
- Tests co-located with source: `foo.ts` + `foo.test.ts`
- Prettier formatting (run `pnpm format`)
- Environment variables validated via `src/lib/env.ts` (`@t3-oss/env-nextjs` + zod)
- Legal disclaimers are non-dismissible per PRD Section 18 — the `DisclaimerFooter` must appear in the root layout on every page.

## Known API Gotchas

### Clerk v7 + Next.js 16

- `SignedIn` and `SignedOut` components are **NOT** exported from `@clerk/nextjs` v7.0.12. Use the `useAuth()` hook from a client component for conditional rendering instead.
- `UserButton` no longer accepts the `afterSignOutUrl` prop. Post-sign-out redirect is configured via `ClerkProvider` props or the Clerk dashboard.

### shadcn/ui base-nova preset

- The `Button` component uses `@base-ui/react/button`, not Radix. It does **not** support the `asChild` prop. Wrap buttons inside `Link` manually instead of using `<Button asChild>`.

### Drizzle numeric columns

- Drizzle 0.45 returns `numeric(p, s)` columns as **strings** to preserve precision. Pure computation functions in `services/market-data/` operate on `number`; conversion happens only at the DB boundary inside `transform.ts` and `ingestion.ts`. Do not change this — switching to `mode: 'number'` would leak floating-point drift into stored prices.

### Tailwind v4

- No `tailwind.config.js`. Theme is defined via `@theme` blocks in `src/app/globals.css`. shadcn CSS variables live in the same file.

## Running Locally

```bash
pnpm install
pnpm dev              # http://localhost:3000
pnpm test             # run Vitest in watch mode
pnpm test:run         # run Vitest once
pnpm build            # production build
pnpm lint             # ESLint
pnpm format           # Prettier (write)
pnpm format:check     # Prettier (check)
pnpm db:push          # apply Drizzle schema to Neon (Phase 2+)
pnpm db:studio        # open Drizzle Studio (Phase 2+)
pnpm db:seed          # load starter universe (after db:push)
pnpm ingest:prices    # fetch EOD prices + compute MAs (needs FMP_API_KEY)
pnpm ingest:fundamentals   # fetch ratios + score stocks (needs FMP_API_KEY)
pnpm detect:signals        # run signal detectors against stored prices+fundamentals
pnpm generate:rationale    # generate AI rationale for signals (needs ANTHROPIC_API_KEY)
```

## Design Spec and Plans

- Design spec: `docs/superpowers/specs/2026-04-10-signalstocks-design.md`
- Phase plans: `docs/superpowers/plans/YYYY-MM-DD-phase-N-*.md`

## Project Decisions

- **No mock data** — real FMP data from day one
- **Full features first, Stripe paywall later** — tier gating is deferred to a later phase
- **Email alerts only** initially (push/SMS/Telegram are post-launch)
- **Monolith architecture** — single Next.js deploy to Vercel
- **Market data provider:** Financial Modeling Prep (FMP). Yahoo Finance was rejected (no official API, scrapers violate ToS), Webull was rejected (broker, not data provider), Polygon.io was rejected (weak on fundamentals), Alpha Vantage was rejected (5 req/min too restrictive), IEX Cloud was rejected (shut down Aug 2024).
