export interface PriceHistoryRow {
  date: string; // ISO date YYYY-MM-DD
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
  ma200: string | null;
}

export interface ChartBar {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLinePoint {
  time: string;
  value: number;
}

export interface ChartMarker {
  time: string;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text: string;
}

export interface ChartData {
  bars: ChartBar[];
  ma200Series: ChartLinePoint[];
}

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function transformPriceHistoryRows(rows: PriceHistoryRow[]): ChartData {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const bars: ChartBar[] = sorted.map((r) => ({
    time: r.date,
    open: toNumber(r.open),
    high: toNumber(r.high),
    low: toNumber(r.low),
    close: toNumber(r.close),
  }));
  const ma200Series: ChartLinePoint[] = sorted
    .filter((r) => r.ma200 !== null)
    .map((r) => ({ time: r.date, value: toNumber(r.ma200 as string) }));
  return { bars, ma200Series };
}

export interface SignalForMarker {
  signalType: string;
  triggeredAt: Date;
  strength: string;
}

export function buildChartMarkersFromSignals(signals: SignalForMarker[]): ChartMarker[] {
  return signals.map((s) => {
    const color =
      s.strength === 'very_strong' ? '#16a34a' : s.strength === 'strong' ? '#22c55e' : '#3b82f6';
    return {
      time: s.triggeredAt.toISOString().slice(0, 10),
      position: 'belowBar',
      shape: 'arrowUp',
      color,
      text: s.signalType,
    };
  });
}
