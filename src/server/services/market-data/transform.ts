import type { FmpHistoricalResponse } from './schemas';
import { computeSMA, computeSlope } from './moving-averages';

/**
 * Shape of a row insert for `daily_prices`. Matches the Drizzle schema:
 * numeric columns are strings, bigint (volume) is a number, date is
 * an ISO YYYY-MM-DD string.
 *
 * Kept as a plain interface (not inferred from Drizzle's insert type)
 * to keep the transform layer independent of the schema file's evolution.
 */
export interface DailyPriceInsertRow {
  stockId: number;
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
  ma150: string | null;
  ma200: string | null;
  ma150Slope: string | null;
  ma200Slope: string | null;
}

const MA150_WINDOW = 150;
const MA200_WINDOW = 200;
const SLOPE_LOOKBACK = 5;

/**
 * Transform an FMP historical response into `daily_prices` insert rows with
 * MA150, MA200, and 5-day slopes pre-computed.
 *
 * Input MUST be in ascending chronological order (parseFmpHistorical guarantees
 * this). Numeric values are converted to strings at the boundary to match
 * Drizzle's default handling of `numeric(p, s)` columns.
 */
export function fmpHistoricalToDbRows(
  response: FmpHistoricalResponse,
  stockId: number,
): DailyPriceInsertRow[] {
  const { historical } = response;
  if (historical.length === 0) return [];

  const closes = historical.map((h) => h.close);
  const ma150 = computeSMA(closes, MA150_WINDOW);
  const ma200 = computeSMA(closes, MA200_WINDOW);
  const ma150Slope = computeSlope(ma150, SLOPE_LOOKBACK);
  const ma200Slope = computeSlope(ma200, SLOPE_LOOKBACK);

  return historical.map((h, i) => ({
    stockId,
    date: h.date,
    open: String(h.open),
    high: String(h.high),
    low: String(h.low),
    close: String(h.close),
    volume: h.volume,
    ma150: ma150[i] === null ? null : String(ma150[i]),
    ma200: ma200[i] === null ? null : String(ma200[i]),
    ma150Slope: ma150Slope[i] === null ? null : String(ma150Slope[i]),
    ma200Slope: ma200Slope[i] === null ? null : String(ma200Slope[i]),
  }));
}
