export type SignalType =
  | 'SIG-01'
  | 'SIG-02'
  | 'SIG-03'
  | 'SIG-04'
  | 'SIG-05'
  | 'SIG-06'
  | 'SIG-07';

export type SignalStrength = 'medium' | 'strong' | 'very_strong';

export type SignalSource = 'system' | 'watchlist';

export interface PriceBar {
  date: string; // ISO YYYY-MM-DD
  close: number;
  volume: number;
  ma150: number | null;
  ma200: number | null;
  ma150Slope: number | null;
  ma200Slope: number | null;
}

export interface DetectedSignal {
  signalType: SignalType;
  strength: SignalStrength;
  triggeredAt: string;
  volumeConfirmed: boolean;
  downgraded: boolean;
}

export interface StockContext {
  ticker: string;
  marketCap: number | null;
  listingDate: string | null;
  exchange: string;
  avgDailyVolume20: number | null;
  fundamentalScore: number | null;
  source: SignalSource;
}
