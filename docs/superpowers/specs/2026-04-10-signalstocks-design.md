# SignalStocks — Design Spec

**Date:** 2026-04-10
**Source:** `SignalStocks_PRD_v2.docx`
**Status:** Approved for planning

## 1. Overview

SignalStocks is a B2C web application that functions as an active investing companion for retail investors. It identifies high-probability buying opportunities by combining fundamental quality filters with technical moving average signals (MA150/MA200), then provides live, evolving recommendations for every tracked stock. Each signal is enriched with AI-generated investment rationale, target prices, stop losses, and ongoing recommendation updates.

Core features:
- **Discover**: Daily signal generation combining fundamental + technical criteria
- **Track & Adapt**: Live recommendation lifecycle that updates every trading day
- **Measure & Learn**: Signal performance simulator + personal trade tracker

## 2. Architecture & Tech Stack

Single Next.js 14+ App Router monolith deployed on Vercel.

```
signal-stocks/
├── src/
│   ├── app/              # Next.js App Router (pages, layouts)
│   │   ├── (auth)/       # Clerk-protected routes
│   │   ├── (public)/     # Landing page, performance dashboard
│   │   └── api/          # API routes + tRPC handler
│   ├── server/
│   │   ├── db/           # Drizzle schema, migrations, queries
│   │   ├── trpc/         # tRPC router definitions
│   │   ├── services/     # Business logic (signals, scoring, AI, alerts)
│   │   └── inngest/      # Pipeline step functions
│   ├── lib/              # Shared utilities, constants, types
│   └── components/       # React components (UI, charts, cards)
├── drizzle/              # Migration files
└── CLAUDE.md
```

| Layer | Tech |
|-------|------|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| API | tRPC v11 |
| DB | Neon PostgreSQL + Drizzle ORM |
| Auth | Clerk |
| Charts | Lightweight Charts (TradingView OSS) |
| AI | Anthropic Claude API (Sonnet) |
| Market Data | Financial Modeling Prep (FMP) |
| Pipeline | Inngest (daily after market close) |
| Email | Resend |
| Hosting | Vercel |
| Payments | Stripe (deferred — full features first) |

**Key decisions:**
- **No mock data** — real FMP data from day one
- **Full features first, paywall later** — Stripe gating deferred
- **Email alerts only** initially (push/SMS/Telegram are post-launch)
- **Monolith** — fastest path, matches PRD tech stack

## 3. Database Schema

Drizzle ORM schema targeting Neon PostgreSQL.

**Core tables:**

### `stocks` — Master universe (~2,500–3,000 tickers)
`id, ticker, name, exchange, sector, industry, market_cap, avg_volume, price, listing_date, is_eligible, last_updated`

### `daily_prices` — Historical EOD data with pre-computed MAs
`id, stock_id, date, open, high, low, close, volume, ma150, ma200, ma150_slope, ma200_slope`
- Index on `(stock_id, date)` — most queried table

### `fundamentals` — Quarterly snapshots with composite score
`id, stock_id, quarter, revenue, eps, gross_margin, operating_margin, net_margin, roe, roa, roic, revenue_growth_yoy, eps_growth, debt_to_equity, current_ratio, interest_coverage, fcf_yield, forward_pe, peg_ratio, ev_ebitda, fundamental_score`

### `signals` — Detected signal events
`id, stock_id, signal_type (SIG-01..SIG-07), strength (medium/strong/very_strong), volume_confirmed, fundamental_score, signal_score, triggered_at, source (system/watchlist)`

### `signal_rationales` — AI-generated content
`id, signal_id, summary, fundamental_thesis, technical_context, target_price, stop_loss, risk_reward, confidence, strategy_note, disclaimer, created_at, updated_at`

### `signal_recommendations` — Lifecycle state machine
`id, signal_id, state (WATCH/BUY/HOLD/TAKE_PARTIAL_PROFIT/SELL/STOP_HIT/DOWNGRADED/EXPIRED), previous_state, target_price, stop_loss, trailing_stop, ai_update_text, transitioned_at`

### `signal_state_log` — Audit trail of all transitions
`id, signal_id, from_state, to_state, reason, created_at`

### `signal_outcomes` — Resolved signal performance
`id, signal_id, outcome (target_hit/stopped_out/expired/downgraded), entry_price, exit_price, actual_return_pct, days_held, resolved_at`

### `users` — Extended by Clerk
`id, clerk_user_id, plan (free/pro/premium), stripe_customer_id, created_at`

### `watchlists` — User-added stocks
`id, user_id, stock_id, source (manual/signal), added_at`

### `watchlist_assessments` — AI assessments for watchlist stocks
`id, watchlist_id, status, fundamental_grade, entry_guidance, alert_conditions, risks, ai_text, recommendation, updated_at`

### `user_trades` — Personal trade log
`id, user_id, stock_id, signal_id (nullable), entry_price, entry_date, shares, exit_price, exit_date, realized_pnl, notes, created_at`

### `alert_preferences` — Per-user notification settings
`id, user_id, alert_type, channel (email), enabled`

### `simulation_snapshots` — Daily platform performance metrics
`id, date, total_signals, win_rate, avg_return, avg_hold_days, risk_reward_ratio, equity_value`

**Key indexes:** `(stock_id, date)` on daily_prices, `(stock_id)` on signals, `(user_id)` on watchlists/trades, `(signal_id, state)` on recommendations.

## 4. Eligibility & Signal Engine

### 4.1 Eligibility Gate (system signals only)

| Filter | Criteria |
|---|---|
| Exchange | NYSE, NASDAQ, AMEX |
| Market Cap | ≥ $500M |
| Avg Daily Volume | ≥ 500K shares (20-day avg) |
| Price | ≥ $5.00 |
| Listing Age | ≥ 12 months |
| Asset Type | Common stock only |

User-added watchlist stocks use relaxed criteria (US-listed common stock, ≥ $2, ≥ 6 months).

### 4.2 Fundamental Scoring (0–100)

Four categories, weighted:
- **Profitability (30%)** — gross/operating/net margin, ROE, ROA, ROIC
- **Growth (25%)** — revenue growth YoY/QoQ, EPS growth, earnings surprise
- **Financial Health (25%)** — debt/equity, current ratio, interest coverage, FCF yield
- **Valuation Reasonableness (20%)** — forward P/E vs sector median, PEG, EV/EBITDA

Each metric scored by percentile rank within its sector. Category scores averaged, weighted to composite. Stocks scoring < 60 excluded from signal pipeline (still scored for watchlist display).

### 4.3 Signal Detection (7 types)

| ID | Name | Trigger | Strength |
|---|---|---|---|
| SIG-01 | MA200 Approaching | Price within 2% of MA200 from below, MA slope > 0 over 5 days | Medium |
| SIG-02 | MA200 Breakout | Price closes above MA200 for 2+ days after being below ≥10 days | Strong |
| SIG-03 | MA150 Approaching | Price within 2% of MA150 from below, slope > 0 | Medium |
| SIG-04 | MA150 Breakout | Price closes above MA150 for 2+ days after being below ≥10 days | Strong |
| SIG-05 | Dual MA Breakout | Breaks above MA150 and MA200 within 5-day window | Very Strong |
| SIG-06 | Golden Cross Setup | MA150 crosses above MA200 while price is above both | Very Strong |
| SIG-07 | Support Bounce | Price touches MA150/MA200 from above (within 1%) and bounces ≥1.5% | Strong |

**Volume confirmation** required for breakout signals (SIG-02, 04, 05, 06): breakout day volume ≥ 1.5× 20-day average. Without confirmation: downgraded by one strength level + tagged "Unconfirmed".

### 4.4 Composite Signal Score

```
Signal Score = (Fundamental Score × 0.5) + (Technical Strength × 0.3) + (Volume Confirmation × 0.2)
```
Technical Strength: Medium=50, Strong=75, Very Strong=100. Volume Confirmed=100, Unconfirmed=50.

### 4.5 Target Price & Stop Loss

**Target:** weighted average — 40% technical resistance, 30% analyst consensus, 30% fundamental fair value.

**Stop Loss:**
- MA200 breakouts: 3–5% below MA200 at signal time
- MA150 breakouts: 3–5% below MA150
- Dual breakout: 5% below lower of MA150/MA200
- Capped at 10% from entry
- ATR-adjusted (14-day)

All signal logic lives in `src/server/services/signals/` as pure functions for easy unit testing.

## 5. Recommendation Lifecycle State Machine

States: `WATCH → BUY → HOLD → TAKE_PARTIAL_PROFIT → SELL / STOP_HIT / DOWNGRADED / EXPIRED`

Implemented as a clean FSM in `src/server/services/recommendations/state-machine.ts`. Each transition is a pure function: `(currentState, marketData, fundamentals) → nextState | null`.

### 5.1 Transition Rules

| From | To | Condition |
|---|---|---|
| WATCH | BUY | Signal confirmed (breakout + volume) |
| WATCH | EXPIRED | 30 days without confirmation |
| BUY | HOLD | User acknowledges or next trading day |
| HOLD | TAKE_PARTIAL_PROFIT | Price gains ≥ 50% of distance to target |
| HOLD | SELL | Price reaches/exceeds target |
| HOLD | STOP_HIT | Price falls to/below stop loss |
| HOLD | DOWNGRADED | Fundamental score drops < 50 OR price falls back below broken MA |
| TAKE_PARTIAL_PROFIT | SELL | Price reaches target |
| TAKE_PARTIAL_PROFIT | STOP_HIT | Price falls to trailing stop |
| DOWNGRADED | STOP_HIT | Price continues falling to stop |
| DOWNGRADED | HOLD | Conditions recover (re-scores ≥ 60, reclaims MA) |
| Any active | EXPIRED | 30 days without resolution + momentum faded |

### 5.2 Dynamic Trailing Stop Logic

Applied during HOLD and TAKE_PARTIAL_PROFIT:
- **Breakeven trail:** price gains ≥ 5% → stop moves to entry price
- **Profit-lock trail:** price gains ≥ 10% → stop moves to entry + 5%
- **ATR trail:** stop trails at 2× 14-day ATR below highest close since entry
- **Highest of the three** used (most protective)

### 5.3 Update Side Effects

Every state transition:
1. Writes to `signal_state_log` with reason string
2. Triggers AI rationale update via Claude API
3. Queues email alert to users tracking that signal/stock

## 6. AI Rationale Engine

**Model:** Claude Sonnet via Anthropic API.

### 6.1 Generation Modes

**Initial Signal Rationale** — on new signal detection. Prompt includes:
- Fundamentals (scores, key metrics, sector comparison)
- Technical context (MA positions, price action, volume, signal type)
- Recent 30-day price history
- Analyst targets (if available)

Output fields: `summary, fundamental_thesis, technical_context, target_price_rationale, stop_loss_rationale, risk_reward, confidence (Low/Medium/High), strategy_note`.

**State Transition Update** — on state change. Prompt includes:
- Original signal rationale (continuity)
- What changed (price movement, MA recross, fundamental deterioration)
- Current state + new state

Output: concise update explaining what changed, why, and what the user should consider.

### 6.2 Implementation Details

- Prompts as template functions in `src/server/services/ai/prompts.ts`
- Structured output via Claude's tool use / JSON mode
- Legal disclaimer appended server-side (not AI-generated) to guarantee presence
- Rationale cached in `signal_rationales`; regenerated only on state transitions or scheduled frequency
- Rate-limited batching for API limits
- Confidence derived from signal score + volume confirmation + fundamental score thresholds
- **Watchlist assessments** use same engine, different prompt template (current status, fundamental grade, entry guidance, alert conditions, risks)

## 7. Data Pipeline (Inngest)

Single Inngest function with sequential steps, triggered daily at 4:30 PM ET via Vercel Cron (cron hits webhook → Inngest takes over).

```
Step 1: Ingest EOD Prices
  Fetch EOD prices + volume for all ~3,000 universe stocks from FMP.
  Use bulk endpoint. Upsert into daily_prices.

Step 2: Compute MAs & Slopes
  MA150, MA200 from last 200 daily closes. 5-day slope for each.
  Update today's daily_prices row.

Step 3: Update Fundamentals (weekly — skip if not due)
  Fetch ratios, income statements, balance sheets from FMP.
  Compute fundamental scores. Upsert into fundamentals.

Step 4: Run Eligibility Filter
  Mark stocks eligible/ineligible per Section 4.1.

Step 5: Detect New Signals
  Run all 7 signal rules against eligible stocks.
  Check volume confirmation. Compute composite score.
  Deduplicate: skip if same signal type active for stock.

Step 6: Run Recommendation State Machine
  Evaluate transitions for all active signals + watchlist stocks.
  Update signal_recommendations, write signal_state_log.
  Update trailing stops. Mark resolved signals in signal_outcomes.

Step 7: Generate AI Rationale
  New signals: initial rationale. Transitions: update text.
  Upsert into signal_rationales.

Step 8: Update Trade Tracker
  Update unrealized P&L on open user_trades using today's close.
  Check target/stop hits on linked signals.

Step 9: Update Simulator
  Recalculate platform win rate, avg return, equity curve.
  Insert daily simulation_snapshots row.

Step 10: Send Alerts
  Queue emails via Resend for new signals, state changes, target/stop hits.
  Daily digest: scheduled separately at 7 AM ET.
```

Each step is an Inngest `step.run()` — failures retry independently. Steps 7 and 10 fan out per signal for parallelism.

**FMP API budget:** Free tier (250 req/day) covers development using bulk endpoints. Weekly fundamentals fetches will require the $29/mo plan once past ~50 stocks.

## 8. UI & Frontend Structure

### 8.1 Routes

```
/                       Landing page (public)
/performance            Platform performance dashboard (public)
/sign-in, /sign-up      Clerk auth pages
/dashboard              Main app (3 tabs)
  /dashboard/signals      Today's Signals (default)
  /dashboard/watchlist    My Watchlist
  /dashboard/trades       My Trades
/stock/[ticker]         Signal detail page with chart + rationale
/simulator              Backtest calculator
/alerts                 Alert preferences
/settings               Account settings
/terms, /privacy        Legal pages
```

### 8.2 Key Components

- **`<SignalCard />`** — ticker, company, price, signal badge, mini 60-day chart w/ MA overlays, fundamental score, target/stop, recommendation state. Expandable for full rationale.
- **`<StockChart />`** — Lightweight Charts wrapper with MA150/MA200 overlays, volume bars, target/stop/trailing stop lines, entry marker.
- **`<RecommendationStateBadge />`** — color-coded state pill (WATCH=yellow, BUY=green, HOLD=blue, TAKE_PARTIAL_PROFIT=teal, SELL=bright green, STOP_HIT=red, DOWNGRADED=orange, EXPIRED=gray).
- **`<RationaleCard />`** — structured AI rationale display with legal disclaimer footer.
- **`<TradeLogForm />`** — "I Took This Trade" form, auto-filled from signal context.
- **`<PortfolioSummary />`** — open positions, closed positions, aggregate stats, equity curve.
- **`<SimulationCalculator />`** — parameter form + results output with equity curve.
- **`<PerformanceHub />`** — combines platform stats + personal analytics.

### 8.3 Design System

- shadcn/ui primitives for all UI elements
- Tailwind for layout and custom styling
- Dark mode supported via shadcn/Tailwind built-ins
- Mobile-first responsive per PRD
- Non-dismissible legal disclaimer footer in root layout

### 8.4 Data Fetching

- tRPC queries with React Query under the hood
- Server components for initial loads (SEO on public pages)
- Client components for interactive elements (charts, forms, live P&L)

## 9. Alerts System

Email via Resend. Template rendered with React Email (`src/emails/`).

**Alert types:**
1. New signal alert (immediate, when qualifying signal fires)
2. State change alert (any tracked stock changes state)
3. Watchlist signal alert (user-added stock triggers BUY)
4. Target/stop hit alert
5. Daily digest (7 AM ET morning summary)
6. Earnings warning (3 days before earnings for HOLD stocks)

**Implementation:**
- Inngest fan-out in parallel for new signals / state changes
- Per-user `alert_preferences` table controls delivery
- Unsubscribe link in every email (updates preferences)
- Resend free tier (3,000/mo, 100/day) for development

## 10. Legal & Compliance

Hard requirements from PRD Section 18:

- **Non-dismissible disclaimer footer** on every page: "SignalStocks provides educational information only. Not financial advice." Implemented in root layout.
- **Signal rationale disclaimer** appended to every AI output server-side: "This analysis is educational only and not financial advice. Past performance does not guarantee future results."
- **Simulator disclaimer** prominent above every backtest output: "Simulated results based on historical data. Past performance does not guarantee future results. This is not financial advice."
- **Recommendation language** — state badges (BUY/SELL/HOLD) refer to signal states, not personalized directives. Copy uses "observations" / "analysis" not "advice."
- **Terms of Service** — SignalStocks is an information product, not an investment advisor. No fiduciary relationship.
- **Privacy Policy** — GDPR/CCPA compliant. Trade data never sold.
- **Data attribution** — FMP and other providers cited per licensing.

## 11. Testing Strategy

### 11.1 Unit Tests (Vitest)
- Signal detection — SIG-01..SIG-07 with synthetic price series
- Fundamental scoring — weights, edge cases (missing, negative)
- State machine transitions — table-driven, exhaustive
- Target/stop calculations — known inputs/outputs
- Trailing stop logic — price series → expected values

### 11.2 Integration Tests (Vitest + test DB)
- Pipeline steps with mocked FMP responses
- tRPC routers end-to-end with test user context
- Alert queuing verification for state transitions

### 11.3 E2E Tests (Playwright)
Critical paths only: sign up → dashboard → add watchlist → log trade → view portfolio.

### 11.4 Backtest Validation
Before launch: run signal engine against 1–2 years of historical data. Verify win rate / avg return / drawdown match PRD targets (55%+ win rate). Doubles as content for the public performance dashboard.

### 11.5 Test Organization
- Co-located tests: `foo.ts` + `foo.test.ts`
- Coverage target: 80%+ on `services/`, `signals/`, `recommendations/`
- Fixtures in `tests/fixtures/` — cached FMP historical data for ~20 representative stocks

## 12. Build Phases

| Phase | Scope | Deliverable |
|---|---|---|
| 1. Foundation | Next.js scaffold, TypeScript, Tailwind, shadcn/ui, Clerk, Neon, Drizzle, layouts, disclaimer footer | Deployable skeleton |
| 2. Database Schema | Drizzle tables, migrations, seed script for universe | `drizzle-kit push`, seed works |
| 3. Market Data Ingestion | FMP client, EOD prices, MA/slope computation | CLI loads universe data |
| 4. Fundamental Scoring | Scoring model, sector percentile logic, ingestion | Stocks have `fundamental_score` |
| 5. Signal Engine | 7 signal detectors, volume confirmation, composite scoring, eligibility | Signals inserted into DB |
| 6. AI Rationale | Claude client, prompts, initial + update generation, disclaimers | Signals have AI rationale |
| 7. Recommendation State Machine | FSM, transitions, trailing stop, state log, outcomes | Signals cycle through states |
| 8. Inngest Pipeline | Orchestrate 3–7 + trade tracker + simulator + cron trigger | Daily pipeline runs end-to-end |
| 9. Dashboard UI | Signal cards, detail pages, watchlist UI, charts, rationale cards, state badges | Browse signals/watchlist |
| 10. Custom Watchlist | Add/remove, initial AI assessment, alert conditions | Track any stock |
| 11. Trade Tracker & Portfolio | Trade logging, portfolio view, P&L, adherence, equity curve | Log and track trades |
| 12. Performance Simulator | Backtest engine, simulator, platform performance dashboard, comparison views | Public dashboard live |
| 13. Alerts | Resend, templates, queuing, preferences, daily digest | Users receive email alerts |
| 14. Polish & Launch | Landing, SEO, errors, perf, Terms/Privacy, analytics, QA | Production ready |

**Stripe subscription gating deliberately deferred** — build full features first, add paywall as a follow-up phase.

## 13. Out of Scope (Deferred)

- Stripe subscriptions and tier gating (deferred per decision)
- Push / SMS / Telegram alerts (email only initially)
- Mobile native app (responsive web only)
- Broker integrations (manual trade entry only)
- Community features
- Options flow integration
- International markets (US-listed only)

These are tracked in the PRD's Future Roadmap (Section 21) and will be reconsidered post-launch.

## 14. Success Criteria (Pre-Launch)

- Signal engine detects all 7 signal types correctly on historical test data
- Recommendation state machine cycles signals through their lifecycle on backtest data
- AI rationale generation produces structured, disclaimer-compliant output
- Daily pipeline runs end-to-end without manual intervention
- Users can sign up, add watchlist stocks, log trades, and view their portfolio
- Public performance dashboard shows real backtest results with proper disclaimers
- Email alerts deliver on new signals and state changes
- All legal disclaimers present and non-dismissible where required
- 80%+ test coverage on business logic modules
