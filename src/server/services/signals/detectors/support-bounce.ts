import type { PriceBar, DetectedSignal } from '../types';

export const TOUCH_PCT = 0.01;
export const BOUNCE_PCT = 0.015;
export const BOUNCE_LOOKBACK = 3;

export function detectSupportBounce(bars: PriceBar[]): DetectedSignal | null {
  if (bars.length < 2) return null;
  const n = bars.length;
  const last = bars[n - 1];

  const start = Math.max(0, n - 1 - BOUNCE_LOOKBACK);
  for (let i = start; i < n - 1; i++) {
    const touch = bars[i];
    for (const maKey of ['ma150', 'ma200'] as const) {
      const ma = touch[maKey];
      if (ma === null) continue;
      // within 1% above ma
      if (touch.close < ma) continue;
      if ((touch.close - ma) / ma > TOUCH_PCT) continue;
      // bounce: last close ≥ 1.5% above touch close
      if ((last.close - touch.close) / touch.close >= BOUNCE_PCT) {
        return {
          signalType: 'SIG-07',
          strength: 'strong',
          triggeredAt: last.date,
          volumeConfirmed: false,
          downgraded: false,
        };
      }
    }
  }
  return null;
}
