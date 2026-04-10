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
import {
  userPlanEnum,
  watchlistSourceEnum,
  alertChannelEnum,
} from './enums';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkUserId: varchar('clerk_user_id', { length: 64 }).notNull().unique(),
  plan: userPlanEnum('plan').notNull().default('free'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    addedAt: timestamp('added_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
