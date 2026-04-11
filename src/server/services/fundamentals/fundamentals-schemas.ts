import { z } from 'zod';

const nullableNumber = z.number().nullable().optional();

export const FmpRatiosEntrySchema = z
  .object({
    symbol: z.string(),
    date: z.string(),
    calendarYear: z.string(),
    period: z.string(),
    grossProfitMargin: nullableNumber,
    operatingProfitMargin: nullableNumber,
    netProfitMargin: nullableNumber,
    returnOnEquity: nullableNumber,
    returnOnAssets: nullableNumber,
    currentRatio: nullableNumber,
    debtEquityRatio: nullableNumber,
    interestCoverage: nullableNumber,
    priceEarningsRatio: nullableNumber,
  })
  .passthrough();

export const FmpRatiosSchema = z.array(FmpRatiosEntrySchema);

export const FmpKeyMetricsEntrySchema = z
  .object({
    symbol: z.string(),
    date: z.string(),
    calendarYear: z.string(),
    period: z.string(),
    roic: nullableNumber,
    freeCashFlowYield: nullableNumber,
    enterpriseValueOverEBITDA: nullableNumber,
    pegRatio: nullableNumber,
    peRatio: nullableNumber,
  })
  .passthrough();

export const FmpKeyMetricsSchema = z.array(FmpKeyMetricsEntrySchema);

export const FmpIncomeStatementEntrySchema = z
  .object({
    symbol: z.string(),
    date: z.string(),
    calendarYear: z.string(),
    period: z.string(),
    revenue: nullableNumber,
    eps: nullableNumber,
    epsdiluted: nullableNumber,
    grossProfit: nullableNumber,
    operatingIncome: nullableNumber,
    netIncome: nullableNumber,
  })
  .passthrough();

export const FmpIncomeStatementSchema = z.array(FmpIncomeStatementEntrySchema);

export type FmpRatiosEntry = z.infer<typeof FmpRatiosEntrySchema>;
export type FmpKeyMetricsEntry = z.infer<typeof FmpKeyMetricsEntrySchema>;
export type FmpIncomeStatementEntry = z.infer<typeof FmpIncomeStatementEntrySchema>;

/**
 * Derive a canonical YYYYQN quarter string from FMP's calendarYear + period.
 * FMP uses "Q1".."Q4" for quarterly data, or "FY" for full-year annual data.
 * We map FY → Q4 so annual rows still participate in the most-recent-quarter logic.
 */
export function deriveQuarter(calendarYear: string, period: string): string {
  const normalizedPeriod = period === 'FY' ? 'Q4' : period;
  return `${calendarYear}${normalizedPeriod}`;
}
