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
