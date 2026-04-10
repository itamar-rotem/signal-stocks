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
    expect(schema.signalStrengthEnum.enumValues).toEqual([
      'medium',
      'strong',
      'very_strong',
    ]);
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
