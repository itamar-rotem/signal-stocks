import { generateSyntheticSeries } from './generate';
import type { SignalViewModel } from '@/server/trpc/routers/signals';
import type { PriceHistoryRow } from '@/components/charts/chart-data';

export const DEMO_END_DATE = '2026-04-10';

export interface DemoStockDetail {
  stock: {
    id: number;
    ticker: string;
    name: string;
    sector: string | null;
    lastPrice: number;
  };
  signals: SignalViewModel[];
  priceHistory: PriceHistoryRow[];
  rationale: {
    summary: string;
    fundamentalThesis: string;
    technicalContext: string;
    strategyNote: string;
    confidence: string;
    disclaimer: string;
  };
}

const DISCLAIMER =
  'Demo content — synthetic data and fabricated rationale for UI preview only. Not investment advice.';

function buildStock(args: {
  id: number;
  ticker: string;
  name: string;
  sector: string;
  seed: number;
  startPrice: number;
  signalType: string;
  strength: 'medium' | 'strong' | 'very_strong';
  state: string;
  confidence: 'Low' | 'Medium' | 'High';
  summary: string;
  thesis: string;
  technical: string;
  strategy: string;
  signalScore: number;
  fundamentalScore: number;
}): DemoStockDetail {
  const priceHistory = generateSyntheticSeries({
    seed: args.seed,
    days: 260,
    startPrice: args.startPrice,
    endDate: DEMO_END_DATE,
  });
  const lastRow = priceHistory[priceHistory.length - 1];
  const lastPrice = Number(lastRow.close);
  const triggeredAt = new Date(`${lastRow.date}T14:30:00Z`);
  const signal: SignalViewModel = {
    signalId: args.id * 100 + 1,
    signalType: args.signalType,
    strength: args.strength,
    volumeConfirmed: true,
    fundamentalScore: args.fundamentalScore,
    signalScore: args.signalScore,
    triggeredAt,
    stock: {
      id: args.id,
      ticker: args.ticker,
      name: args.name,
      sector: args.sector,
      lastPrice,
    },
    recommendation: {
      state: args.state,
      targetPrice: +(lastPrice * 1.18).toFixed(2),
      stopLoss: +(lastPrice * 0.92).toFixed(2),
      trailingStop: null,
      transitionedAt: triggeredAt,
    },
    rationale: {
      summary: args.summary,
      confidence: args.confidence,
    },
  };
  return {
    stock: {
      id: args.id,
      ticker: args.ticker,
      name: args.name,
      sector: args.sector,
      lastPrice,
    },
    signals: [signal],
    priceHistory,
    rationale: {
      summary: args.summary,
      fundamentalThesis: args.thesis,
      technicalContext: args.technical,
      strategyNote: args.strategy,
      confidence: args.confidence,
      disclaimer: DISCLAIMER,
    },
  };
}

export const DEMO_STOCKS: Record<string, DemoStockDetail> = {
  NOVA: buildStock({
    id: 1,
    ticker: 'NOVA',
    name: 'Nova Semiconductor Corp.',
    sector: 'Technology',
    seed: 101,
    startPrice: 58,
    signalType: 'SIG-02',
    strength: 'very_strong',
    state: 'BUY',
    confidence: 'High',
    signalScore: 88,
    fundamentalScore: 82,
    summary:
      'Nova Semiconductor cleared its MA200 on strong volume while revenue growth stayed above 20% YoY. The setup is a textbook post-consolidation breakout.',
    thesis:
      'Revenue growth 24% YoY, gross margin expanding from 46% to 51%, and FCF yield firmly positive. Debt/equity below 0.3. Valuation is demanding but justified by the quality profile.',
    technical:
      'Price broke out above the MA200 after a 10-week base. Volume on breakout ran ~2.1x the 50-day average. MA200 slope turned positive four weeks ago.',
    strategy:
      'Scale in on the breakout retest. Trail a 10% stop once the position moves 15% in favor. Re-evaluate on the next earnings print.',
  }),
  AURA: buildStock({
    id: 2,
    ticker: 'AURA',
    name: 'Aura Health Systems',
    sector: 'Healthcare',
    seed: 202,
    startPrice: 120,
    signalType: 'SIG-04',
    strength: 'strong',
    state: 'HOLD',
    confidence: 'Medium',
    signalScore: 74,
    fundamentalScore: 79,
    summary:
      'Aura Health is riding a quality uptrend. The signal fired on a VCP breakout with volume confirmation but the recommendation is now HOLD pending the next fundamental update.',
    thesis:
      'Operating margin 18%, ROIC 15%, low leverage. EPS growth 12% YoY. Defensive growth profile — not spectacular but durable.',
    technical:
      'Clean VCP pattern resolved to the upside. Relative strength vs the broader market is at a 6-month high.',
    strategy:
      'Hold existing position. Do not add until either a new base forms or earnings reaffirm the growth trajectory.',
  }),
  HELIO: buildStock({
    id: 3,
    ticker: 'HELIO',
    name: 'Helio Energy Partners',
    sector: 'Energy',
    seed: 313,
    startPrice: 42,
    signalType: 'SIG-01',
    strength: 'medium',
    state: 'WATCH',
    confidence: 'Medium',
    signalScore: 62,
    fundamentalScore: 68,
    summary:
      'Helio is approaching its MA200 from below. The signal is WATCH — fundamentals are improving but the technical confirmation has not arrived yet.',
    thesis:
      'Revenue growth accelerating (8% → 14% YoY over three quarters). Margins still thin but improving. Balance sheet is clean enough to survive a downturn.',
    technical:
      'Price is within 3% of its MA200. Volume has been contracting, which is bullish ahead of a potential breakout.',
    strategy:
      'Wait for a confirmed breakout above MA200 on volume. Do not chase before confirmation.',
  }),
};

export const DEMO_SIGNAL_LIST: SignalViewModel[] = Object.values(DEMO_STOCKS).map(
  (s) => s.signals[0],
);
