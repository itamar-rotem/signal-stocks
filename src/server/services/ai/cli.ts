import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { stocks, signals, signalRationales, fundamentals, dailyPrices } from '@/server/db/schema';
import { AnthropicRationaleClient } from './anthropic-client';
import { generateInitialRationale } from './generation';
import { upsertRationale } from './persistence';
import type { RationaleInput } from './types';

const PRICE_LOOKBACK = 30;

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const argIds = process.argv
    .slice(2)
    .map((s) => Number(s))
    .filter((n) => !Number.isNaN(n));

  // Load signals needing rationale.
  const rows = await db
    .select({
      signalId: signals.id,
      signalType: signals.signalType,
      strength: signals.strength,
      volumeConfirmed: signals.volumeConfirmed,
      fundamentalScore: signals.fundamentalScore,
      signalScore: signals.signalScore,
      stockId: signals.stockId,
      ticker: stocks.ticker,
      name: stocks.name,
      sector: stocks.sector,
    })
    .from(signals)
    .leftJoin(signalRationales, eq(signalRationales.signalId, signals.id))
    .innerJoin(stocks, eq(stocks.id, signals.stockId))
    .where(argIds.length > 0 ? undefined : isNull(signalRationales.id));

  const targets = argIds.length > 0 ? rows.filter((r) => argIds.includes(r.signalId)) : rows;

  if (targets.length === 0) {
    console.log('No signals need rationale.');
    return;
  }

  const provider = new AnthropicRationaleClient();
  console.log(`Generating rationale for ${targets.length} signal(s)...`);

  let ok = 0;
  const errors: { signalId: number; error: string }[] = [];

  for (const t of targets) {
    try {
      // latest fundamentals
      const [latestFund] = await db
        .select()
        .from(fundamentals)
        .where(eq(fundamentals.stockId, t.stockId))
        .orderBy(desc(fundamentals.quarter))
        .limit(1);

      // recent prices
      const priceRows = await db
        .select({
          date: dailyPrices.date,
          close: dailyPrices.close,
          ma150: dailyPrices.ma150,
          ma200: dailyPrices.ma200,
        })
        .from(dailyPrices)
        .where(eq(dailyPrices.stockId, t.stockId))
        .orderBy(desc(dailyPrices.date))
        .limit(PRICE_LOOKBACK);

      if (priceRows.length === 0) {
        errors.push({ signalId: t.signalId, error: 'no price history' });
        continue;
      }
      const recentBars = priceRows
        .slice()
        .reverse()
        .map((r) => ({ date: r.date, close: Number(r.close) }));
      const latestBar = recentBars[recentBars.length - 1];

      const fundamentalMetrics: Record<string, number | null> = latestFund
        ? {
            grossMargin: toNumber(latestFund.grossMargin),
            operatingMargin: toNumber(latestFund.operatingMargin),
            netMargin: toNumber(latestFund.netMargin),
            roe: toNumber(latestFund.roe),
            roic: toNumber(latestFund.roic),
            debtToEquity: toNumber(latestFund.debtToEquity),
            forwardPe: toNumber(latestFund.forwardPe),
          }
        : {};

      const input: RationaleInput = {
        signalId: t.signalId,
        ticker: t.ticker,
        companyName: t.name,
        signalType: t.signalType,
        strength: t.strength,
        volumeConfirmed: t.volumeConfirmed,
        fundamentalScore: toNumber(t.fundamentalScore),
        signalScore: toNumber(t.signalScore),
        currentPrice: latestBar.close,
        ma150: toNumber(priceRows[0].ma150),
        ma200: toNumber(priceRows[0].ma200),
        fundamentalMetrics,
        sector: t.sector,
        recentBars,
      };

      const rationale = await generateInitialRationale(input, provider);
      await upsertRationale(t.signalId, rationale);
      console.log(
        `  ${t.ticker.padEnd(8)} signal=${t.signalId} confidence=${rationale.confidence}`,
      );
      ok++;
    } catch (err) {
      errors.push({
        signalId: t.signalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(`\n=== Rationale Summary ===`);
  console.log(`Success: ${ok}`);
  if (errors.length > 0) {
    console.log(`Errors:  ${errors.length}`);
    for (const e of errors) console.log(`  signal=${e.signalId}: ${e.error}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Rationale generation failed:', err);
    process.exit(1);
  });
