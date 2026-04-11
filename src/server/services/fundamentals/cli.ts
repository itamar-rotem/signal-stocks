/**
 * Fundamentals ingestion CLI.
 *
 * Run with: `pnpm ingest:fundamentals [ticker1 ticker2 ...]`
 *
 * With no arguments, loads all tickers from the stocks table and ingests them.
 * Each ticker fetches ratios, key metrics, and income statement from FMP, then
 * computes sector-relative fundamental scores and upserts to the fundamentals table.
 */
import { db } from '@/server/db';
import { stocks } from '@/server/db/schema';
import { ingestFundamentalsForTickers } from './ingestion';

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

  const summary = await ingestFundamentalsForTickers(tickers);

  console.log('\n=== Ingest Summary ===');
  console.log(`Successful: ${summary.results.length}`);
  for (const r of summary.results) {
    const score = r.fundamentalScore !== null ? r.fundamentalScore.toFixed(2) : 'n/a';
    console.log(`  ${r.ticker.padEnd(8)} → score: ${score}  (${r.quarter})`);
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
