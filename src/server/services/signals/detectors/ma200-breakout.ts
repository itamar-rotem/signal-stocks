import type { PriceBar, DetectedSignal } from '../types';

export const BREAKOUT_CONFIRM_DAYS = 2;
export const BREAKOUT_PRIOR_LOOKBACK = 12;
export const BREAKOUT_PRIOR_MIN_BELOW = 10;

function isAbove(bar: PriceBar, maKey: 'ma150' | 'ma200'): boolean | null {
  const ma = bar[maKey];
  if (ma === null) return null;
  return bar.close > ma;
}

export function detectMaBreakout(
  bars: PriceBar[],
  maKey: 'ma150' | 'ma200',
  signalType: 'SIG-02' | 'SIG-04',
): DetectedSignal | null {
  const n = bars.length;
  if (n < BREAKOUT_CONFIRM_DAYS + BREAKOUT_PRIOR_LOOKBACK) return null;

  // Latest `BREAKOUT_CONFIRM_DAYS` bars must all be above
  for (let i = n - BREAKOUT_CONFIRM_DAYS; i < n; i++) {
    const above = isAbove(bars[i], maKey);
    if (above !== true) return null;
  }

  // Of the `BREAKOUT_PRIOR_LOOKBACK` bars before that, at least
  // `BREAKOUT_PRIOR_MIN_BELOW` must have closed below
  let belowCount = 0;
  const priorEnd = n - BREAKOUT_CONFIRM_DAYS;
  const priorStart = priorEnd - BREAKOUT_PRIOR_LOOKBACK;
  for (let i = priorStart; i < priorEnd; i++) {
    const above = isAbove(bars[i], maKey);
    if (above === false) belowCount++;
  }
  if (belowCount < BREAKOUT_PRIOR_MIN_BELOW) return null;

  return {
    signalType,
    strength: 'strong',
    triggeredAt: bars[n - 1].date,
    volumeConfirmed: false,
    downgraded: false,
  };
}

export function detectMa200Breakout(bars: PriceBar[]): DetectedSignal | null {
  return detectMaBreakout(bars, 'ma200', 'SIG-02');
}
