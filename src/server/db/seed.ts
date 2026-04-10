/**
 * Seed script — loads the starter stock universe into the `stocks` table.
 *
 * Run with: `pnpm db:seed`
 *
 * Idempotent via ON CONFLICT DO NOTHING on ticker. Safe to re-run.
 * Phase 3 will extend this with FMP-fetched universe data.
 */
import { db } from './index';
import { stocks } from './schema';
import { parseUniverse } from './seed-parser';
import universeData from './seed-data/universe.json';

async function main() {
  console.log('Parsing seed universe...');
  const rows = parseUniverse(universeData);
  console.log(`Validated ${rows.length} entries.`);

  console.log('Inserting into stocks...');
  const inserted = await db
    .insert(stocks)
    .values(
      rows.map((r) => ({
        ticker: r.ticker,
        name: r.name,
        exchange: r.exchange,
        sector: r.sector,
        industry: r.industry,
      })),
    )
    .onConflictDoNothing({ target: stocks.ticker })
    .returning({ id: stocks.id, ticker: stocks.ticker });

  console.log(
    `Seed complete. Inserted ${inserted.length} new rows (${rows.length - inserted.length} already existed).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
