import { inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { stocks, dailyPrices } from '@/server/db/schema';
import { FmpClient, type MarketDataProvider } from './fmp-client';
import { fmpHistoricalToDbRows } from './transform';

export interface IngestResult {
  ticker: string;
  stockId: number;
  rowsUpserted: number;
}

export interface IngestSummary {
  results: IngestResult[];
  errors: { ticker: string; error: string }[];
}

/**
 * Fetch historical prices for every ticker, compute MAs + slopes, and upsert
 * into `daily_prices`.
 *
 * - Lookup stock IDs in one query, skipping tickers not in the `stocks` table.
 * - Per-ticker failures are captured in `errors` and do not abort the run.
 * - Upsert strategy: on conflict (stock_id, date) → overwrite OHLCV + MAs.
 *   This lets re-runs heal partial or stale data.
 */
export async function ingestPricesForTickers(
  tickers: string[],
  provider: MarketDataProvider = new FmpClient(),
): Promise<IngestSummary> {
  const summary: IngestSummary = { results: [], errors: [] };
  if (tickers.length === 0) return summary;

  const universe = await db
    .select({ id: stocks.id, ticker: stocks.ticker })
    .from(stocks)
    .where(inArray(stocks.ticker, tickers));

  const tickerToId = new Map(universe.map((row) => [row.ticker, row.id]));

  for (const ticker of tickers) {
    const stockId = tickerToId.get(ticker);
    if (stockId === undefined) {
      summary.errors.push({
        ticker,
        error: `Ticker not found in stocks table — run pnpm db:seed first`,
      });
      continue;
    }

    try {
      const response = await provider.getHistoricalPrices(ticker);
      const rows = fmpHistoricalToDbRows(response, stockId);
      if (rows.length === 0) {
        summary.results.push({ ticker, stockId, rowsUpserted: 0 });
        continue;
      }

      await db
        .insert(dailyPrices)
        .values(rows)
        .onConflictDoUpdate({
          target: [dailyPrices.stockId, dailyPrices.date],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            volume: sql`excluded.volume`,
            ma150: sql`excluded.ma150`,
            ma200: sql`excluded.ma200`,
            ma150Slope: sql`excluded.ma150_slope`,
            ma200Slope: sql`excluded.ma200_slope`,
          },
        });

      summary.results.push({ ticker, stockId, rowsUpserted: rows.length });
    } catch (err) {
      summary.errors.push({
        ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
