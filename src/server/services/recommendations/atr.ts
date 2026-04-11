export interface OhlcBar {
  date: string;
  high: number;
  low: number;
  close: number;
}

export const ATR_PERIOD = 14;

/**
 * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
 * ATR = simple average of TR over the last 14 bars.
 * Returns null if fewer than 15 bars (need at least one prevClose + 14 TRs).
 */
export function compute14DayATR(bars: OhlcBar[]): number | null {
  if (bars.length < ATR_PERIOD + 1) return null;
  const trs: number[] = [];
  for (let i = bars.length - ATR_PERIOD; i < bars.length; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];
    const hl = curr.high - curr.low;
    const hc = Math.abs(curr.high - prev.close);
    const lc = Math.abs(curr.low - prev.close);
    trs.push(Math.max(hl, hc, lc));
  }
  return trs.reduce((a, b) => a + b, 0) / ATR_PERIOD;
}
