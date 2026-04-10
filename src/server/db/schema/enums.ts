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

export const signalStrengthEnum = pgEnum('signal_strength', [
  'medium',
  'strong',
  'very_strong',
]);

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
