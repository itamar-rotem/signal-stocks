import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { stocks, dailyPrices, fundamentals, signals } from '@/server/db/schema';
import { detectAllSignals } from './detect-all';
import { isEligible } from './eligibility';
import { computeSignalScore } from './composite-score';
import { VOLUME_LOOKBACK } from './volume-confirmation';
import type { PriceBar, StockContext } from './types';

export interface SignalIngestionSummary {
  signalsCreated: number;
  skippedIneligible: number;
  processed: number;
  errors: { ticker: string; error: string }[];
}

const PRICE_HISTORY_DAYS = 220;

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function ingestSignalsForTickers(
  tickers: string[],
  today: string = new Date().toISOString().slice(0, 10),
): Promise<SignalIngestionSummary> {
  const summary: SignalIngestionSummary = {
    signalsCreated: 0,
    skippedIneligible: 0,
    processed: 0,
    errors: [],
  };
  if (tickers.length === 0) return summary;

  const stockRows = await db
    .select({
      id: stocks.id,
      ticker: stocks.ticker,
      exchange: stocks.exchange,
      marketCap: stocks.marketCap,
      listingDate: stocks.listingDate,
    })
    .from(stocks)
    .where(inArray(stocks.ticker, tickers));

  for (const stock of stockRows) {
    summary.processed++;
    try {
      // latest fundamentals
      const [latestFund] = await db
        .select({ fundamentalScore: fundamentals.fundamentalScore })
        .from(fundamentals)
        .where(eq(fundamentals.stockId, stock.id))
        .orderBy(desc(fundamentals.quarter))
        .limit(1);

      const fundamentalScore = latestFund ? toNumber(latestFund.fundamentalScore) : null;

      // recent prices (desc, then reversed to chronological)
      const priceRows = await db
        .select({
          date: dailyPrices.date,
          close: dailyPrices.close,
          volume: dailyPrices.volume,
          ma150: dailyPrices.ma150,
          ma200: dailyPrices.ma200,
          ma150Slope: dailyPrices.ma150Slope,
          ma200Slope: dailyPrices.ma200Slope,
        })
        .from(dailyPrices)
        .where(eq(dailyPrices.stockId, stock.id))
        .orderBy(desc(dailyPrices.date))
        .limit(PRICE_HISTORY_DAYS);

      if (priceRows.length === 0) {
        summary.errors.push({
          ticker: stock.ticker,
          error: 'No price history — run pnpm ingest:prices first',
        });
        continue;
      }

      const bars: PriceBar[] = priceRows
        .slice()
        .reverse()
        .map((row) => ({
          date: row.date,
          close: Number(row.close),
          volume: row.volume,
          ma150: toNumber(row.ma150),
          ma200: toNumber(row.ma200),
          ma150Slope: toNumber(row.ma150Slope),
          ma200Slope: toNumber(row.ma200Slope),
        }));

      // Compute avgDailyVolume20 over last 20 bars
      let avgVol20: number | null = null;
      if (bars.length >= VOLUME_LOOKBACK) {
        let sum = 0;
        for (let i = bars.length - VOLUME_LOOKBACK; i < bars.length; i++) {
          sum += bars[i].volume;
        }
        avgVol20 = sum / VOLUME_LOOKBACK;
      }

      const lastBar = bars[bars.length - 1];
      const ctx: StockContext = {
        ticker: stock.ticker,
        marketCap: stock.marketCap,
        listingDate: stock.listingDate,
        exchange: stock.exchange,
        avgDailyVolume20: avgVol20,
        fundamentalScore,
        source: 'system',
      };

      if (!isEligible(ctx, lastBar.close, today)) {
        summary.skippedIneligible++;
        continue;
      }

      const detected = detectAllSignals(bars);
      if (detected.length === 0) continue;

      const toStr = (n: number | null): string | null => (n === null ? null : String(n));

      for (const sig of detected) {
        const score = computeSignalScore(fundamentalScore, sig.strength, sig.volumeConfirmed);
        await db
          .insert(signals)
          .values({
            stockId: stock.id,
            signalType: sig.signalType,
            strength: sig.strength,
            volumeConfirmed: sig.volumeConfirmed,
            fundamentalScore: toStr(fundamentalScore),
            signalScore: toStr(score),
            triggeredAt: new Date(sig.triggeredAt + 'T00:00:00Z'),
            source: 'system',
          })
          .onConflictDoNothing({
            target: [signals.stockId, signals.signalType, signals.triggeredAt],
          });
        summary.signalsCreated++;
      }
    } catch (err) {
      summary.errors.push({
        ticker: stock.ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
