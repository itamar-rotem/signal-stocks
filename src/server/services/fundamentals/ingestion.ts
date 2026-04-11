import { inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { stocks, fundamentals } from '@/server/db/schema';
import {
  FmpFundamentalsClient,
  type FundamentalsProvider,
} from './fmp-fundamentals-client';
import { deriveQuarter } from './fundamentals-schemas';
import {
  scoreProfitability,
  scoreGrowth,
  scoreFinancialHealth,
  scoreValuation,
  scoreComposite,
  type FundamentalMetrics,
  type PeerMetrics,
} from './scoring';

export interface FundamentalsResult {
  ticker: string;
  stockId: number;
  quarter: string;
  fundamentalScore: number | null;
}

export interface FundamentalsSummary {
  results: FundamentalsResult[];
  errors: { ticker: string; error: string }[];
}

interface StockRow {
  id: number;
  ticker: string;
  sector: string | null;
}

interface RawFundamentals {
  stockId: number;
  ticker: string;
  sector: string | null;
  quarter: string;
  revenue: number | null;
  eps: number | null;
  metrics: FundamentalMetrics;
}

const EMPTY_PEERS: PeerMetrics = {
  grossMargin: [],
  operatingMargin: [],
  netMargin: [],
  roe: [],
  roa: [],
  roic: [],
  revenueGrowthYoy: [],
  epsGrowth: [],
  debtToEquity: [],
  currentRatio: [],
  interestCoverage: [],
  fcfYield: [],
  forwardPe: [],
  pegRatio: [],
  evEbitda: [],
};

function buildPeerMetrics(peers: RawFundamentals[]): PeerMetrics {
  const out: PeerMetrics = {
    grossMargin: [],
    operatingMargin: [],
    netMargin: [],
    roe: [],
    roa: [],
    roic: [],
    revenueGrowthYoy: [],
    epsGrowth: [],
    debtToEquity: [],
    currentRatio: [],
    interestCoverage: [],
    fcfYield: [],
    forwardPe: [],
    pegRatio: [],
    evEbitda: [],
  };
  for (const p of peers) {
    (Object.keys(out) as (keyof PeerMetrics)[]).forEach((key) => {
      out[key].push(p.metrics[key]);
    });
  }
  return out;
}

export async function ingestFundamentalsForTickers(
  tickers: string[],
  provider: FundamentalsProvider = new FmpFundamentalsClient(),
): Promise<FundamentalsSummary> {
  const summary: FundamentalsSummary = { results: [], errors: [] };
  if (tickers.length === 0) return summary;

  const universe = (await db
    .select({ id: stocks.id, ticker: stocks.ticker, sector: stocks.sector })
    .from(stocks)
    .where(inArray(stocks.ticker, tickers))) as StockRow[];

  const tickerToRow = new Map(universe.map((row) => [row.ticker, row]));
  const raws: RawFundamentals[] = [];

  // Pass 1: fetch per-ticker raw fundamentals
  for (const ticker of tickers) {
    const row = tickerToRow.get(ticker);
    if (!row) {
      summary.errors.push({
        ticker,
        error: 'Ticker not found in stocks table — run pnpm db:seed first',
      });
      continue;
    }

    try {
      const [ratios, keyMetrics, income] = await Promise.all([
        provider.getRatios(ticker),
        provider.getKeyMetrics(ticker),
        provider.getIncomeStatement(ticker),
      ]);

      if (ratios.length === 0 || income.length === 0) {
        summary.errors.push({
          ticker,
          error: 'FMP returned no fundamental data for this ticker',
        });
        continue;
      }

      const latestRatios = ratios[0];
      const latestKey = keyMetrics[0] ?? null;
      const latestIncome = income[0];

      // YoY revenue growth: compare most recent quarter to same quarter last year
      const yearAgoIncome =
        income.find(
          (i) =>
            i.period === latestIncome.period &&
            Number(i.calendarYear) === Number(latestIncome.calendarYear) - 1,
        ) ?? null;

      const revenueGrowthYoy =
        latestIncome.revenue != null &&
        yearAgoIncome?.revenue != null &&
        yearAgoIncome.revenue !== 0
          ? (latestIncome.revenue - yearAgoIncome.revenue) / yearAgoIncome.revenue
          : null;

      const epsGrowth =
        latestIncome.eps != null &&
        yearAgoIncome?.eps != null &&
        yearAgoIncome.eps !== 0
          ? (latestIncome.eps - yearAgoIncome.eps) / Math.abs(yearAgoIncome.eps)
          : null;

      const metrics: FundamentalMetrics = {
        grossMargin: latestRatios.grossProfitMargin ?? null,
        operatingMargin: latestRatios.operatingProfitMargin ?? null,
        netMargin: latestRatios.netProfitMargin ?? null,
        roe: latestRatios.returnOnEquity ?? null,
        roa: latestRatios.returnOnAssets ?? null,
        roic: latestKey?.roic ?? null,
        revenueGrowthYoy,
        epsGrowth,
        debtToEquity: latestRatios.debtEquityRatio ?? null,
        currentRatio: latestRatios.currentRatio ?? null,
        interestCoverage: latestRatios.interestCoverage ?? null,
        fcfYield: latestKey?.freeCashFlowYield ?? null,
        forwardPe: latestRatios.priceEarningsRatio ?? null,
        pegRatio: latestKey?.pegRatio ?? null,
        evEbitda: latestKey?.enterpriseValueOverEBITDA ?? null,
      };

      raws.push({
        stockId: row.id,
        ticker: row.ticker,
        sector: row.sector,
        quarter: deriveQuarter(latestRatios.calendarYear, latestRatios.period),
        revenue: latestIncome.revenue ?? null,
        eps: latestIncome.eps ?? null,
        metrics,
      });
    } catch (err) {
      summary.errors.push({
        ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (raws.length === 0) return summary;

  // Pass 2: group by sector, score each stock against its sector peers
  const bySector = new Map<string, RawFundamentals[]>();
  for (const raw of raws) {
    const key = raw.sector ?? '__unknown__';
    const list = bySector.get(key) ?? [];
    list.push(raw);
    bySector.set(key, list);
  }

  // Pass 3: score + upsert
  for (const raw of raws) {
    const sectorPeers = bySector.get(raw.sector ?? '__unknown__') ?? [];
    const peerMetrics =
      sectorPeers.length > 1 ? buildPeerMetrics(sectorPeers) : EMPTY_PEERS;

    const profitability = scoreProfitability(raw.metrics, peerMetrics);
    const growth = scoreGrowth(raw.metrics, peerMetrics);
    const health = scoreFinancialHealth(raw.metrics, peerMetrics);
    const valuation = scoreValuation(raw.metrics, peerMetrics);
    const composite = scoreComposite(profitability, growth, health, valuation);

    const toStr = (n: number | null): string | null =>
      n === null ? null : String(n);

    try {
      await db
        .insert(fundamentals)
        .values({
          stockId: raw.stockId,
          quarter: raw.quarter,
          revenue: raw.revenue,
          eps: toStr(raw.eps),
          grossMargin: toStr(raw.metrics.grossMargin),
          operatingMargin: toStr(raw.metrics.operatingMargin),
          netMargin: toStr(raw.metrics.netMargin),
          roe: toStr(raw.metrics.roe),
          roa: toStr(raw.metrics.roa),
          roic: toStr(raw.metrics.roic),
          revenueGrowthYoy: toStr(raw.metrics.revenueGrowthYoy),
          epsGrowth: toStr(raw.metrics.epsGrowth),
          debtToEquity: toStr(raw.metrics.debtToEquity),
          currentRatio: toStr(raw.metrics.currentRatio),
          interestCoverage: toStr(raw.metrics.interestCoverage),
          fcfYield: toStr(raw.metrics.fcfYield),
          forwardPe: toStr(raw.metrics.forwardPe),
          pegRatio: toStr(raw.metrics.pegRatio),
          evEbitda: toStr(raw.metrics.evEbitda),
          fundamentalScore: toStr(composite),
        })
        .onConflictDoUpdate({
          target: [fundamentals.stockId, fundamentals.quarter],
          set: {
            revenue: sql`excluded.revenue`,
            eps: sql`excluded.eps`,
            grossMargin: sql`excluded.gross_margin`,
            operatingMargin: sql`excluded.operating_margin`,
            netMargin: sql`excluded.net_margin`,
            roe: sql`excluded.roe`,
            roa: sql`excluded.roa`,
            roic: sql`excluded.roic`,
            revenueGrowthYoy: sql`excluded.revenue_growth_yoy`,
            epsGrowth: sql`excluded.eps_growth`,
            debtToEquity: sql`excluded.debt_to_equity`,
            currentRatio: sql`excluded.current_ratio`,
            interestCoverage: sql`excluded.interest_coverage`,
            fcfYield: sql`excluded.fcf_yield`,
            forwardPe: sql`excluded.forward_pe`,
            pegRatio: sql`excluded.peg_ratio`,
            evEbitda: sql`excluded.ev_ebitda`,
            fundamentalScore: sql`excluded.fundamental_score`,
          },
        });

      summary.results.push({
        ticker: raw.ticker,
        stockId: raw.stockId,
        quarter: raw.quarter,
        fundamentalScore: composite,
      });
    } catch (err) {
      summary.errors.push({
        ticker: raw.ticker,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
