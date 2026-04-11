import {
  pgTable,
  serial,
  integer,
  numeric,
  timestamp,
  boolean,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { stocks } from './stocks';
import {
  signalTypeEnum,
  signalStrengthEnum,
  signalSourceEnum,
  recommendationStateEnum,
  signalOutcomeEnum,
  confidenceEnum,
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
    signalUniqueIdx: uniqueIndex('signals_stock_type_triggered_idx').on(
      table.stockId,
      table.signalType,
      table.triggeredAt,
    ),
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
  confidence: confidenceEnum('confidence'),
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
