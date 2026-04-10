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
    ticker: varchar('ticker', { length: 10 }).notNull(),
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
