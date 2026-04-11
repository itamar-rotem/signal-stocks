/**
 * Market data ingestion CLI.
 *
 * Run with: `pnpm ingest:prices [ticker1 ticker2 ...]`
 *
 * With no arguments, loads all tickers from the stocks table and ingests them
 * serially. The FMP free tier is 250 req/day — a full universe fetch uses one
 * request per ticker. For the current 30-seed universe this is ~30 requests.
 */
import { db } from '@/server/db';
import { stocks } from '@/server/db/schema';
import { ingestPricesForTickers } from './ingestion';

async function main() {
  const argTickers = process.argv.slice(2);
  let tickers: string[];

  if (argTickers.length > 0) {
    tickers = argTickers.map((t) => t.toUpperCase());
    console.log(`Ingesting ${tickers.length} ticker(s) from CLI args...`);
  } else {
    const rows = await db.select({ ticker: stocks.ticker }).from(stocks);
    tickers = rows.map((r) => r.ticker);
    console.log(`Ingesting full universe — ${tickers.length} ticker(s)...`);
  }

  const summary = await ingestPricesForTickers(tickers);

  console.log('\n=== Ingest Summary ===');
  console.log(`Successful: ${summary.results.length}`);
  for (const r of summary.results) {
    console.log(`  ${r.ticker.padEnd(8)} → ${r.rowsUpserted} rows`);
  }
  if (summary.errors.length > 0) {
    console.log(`\nErrors: ${summary.errors.length}`);
    for (const e of summary.errors) {
      console.log(`  ${e.ticker.padEnd(8)} → ${e.error}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });
