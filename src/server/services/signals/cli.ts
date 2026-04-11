import { db } from '@/server/db';
import { stocks } from '@/server/db/schema';
import { ingestSignalsForTickers } from './ingestion';

async function main() {
  const argTickers = process.argv.slice(2);
  let tickers: string[];

  if (argTickers.length > 0) {
    tickers = argTickers.map((t) => t.toUpperCase());
    console.log(`Detecting signals for ${tickers.length} ticker(s) from CLI args...`);
  } else {
    const rows = await db.select({ ticker: stocks.ticker }).from(stocks);
    tickers = rows.map((r) => r.ticker);
    console.log(`Detecting signals for full universe — ${tickers.length} ticker(s)...`);
  }

  const summary = await ingestSignalsForTickers(tickers);

  console.log('\n=== Signal Detection Summary ===');
  console.log(`Processed:        ${summary.processed}`);
  console.log(`Signals created:  ${summary.signalsCreated}`);
  console.log(`Skipped ineligible: ${summary.skippedIneligible}`);
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
    console.error('Signal detection failed:', err);
    process.exit(1);
  });
