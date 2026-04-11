import type { PriceBar, DetectedSignal } from '../types';

export const DUAL_WINDOW_DAYS = 5;

/**
 * Find the index of the most recent "cross above" a given MA — the first day
 * at which the bar closes above MA after having been below on the prior bar.
 * Searches the most recent 15 bars. Returns -1 if not found.
 */
function findRecentBreakIndex(bars: PriceBar[], maKey: 'ma150' | 'ma200'): number {
  const windowStart = Math.max(1, bars.length - 15);
  let latest = -1;
  for (let i = windowStart; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    const prevMa = prev[maKey];
    const currMa = curr[maKey];
    if (prevMa === null || currMa === null) continue;
    if (prev.close < prevMa && curr.close > currMa) {
      latest = i;
    }
  }
  return latest;
}

export function detectDualMaBreakout(bars: PriceBar[]): DetectedSignal | null {
  if (bars.length < 2) return null;
  const ma150Idx = findRecentBreakIndex(bars, 'ma150');
  const ma200Idx = findRecentBreakIndex(bars, 'ma200');
  if (ma150Idx === -1 || ma200Idx === -1) return null;
  if (Math.abs(ma150Idx - ma200Idx) > DUAL_WINDOW_DAYS) return null;

  // trigger fires on the later of the two breaks — must be one of the last
  // few bars
  const triggerIdx = Math.max(ma150Idx, ma200Idx);
  if (triggerIdx !== bars.length - 1) return null;

  return {
    signalType: 'SIG-05',
    strength: 'very_strong',
    triggeredAt: bars[triggerIdx].date,
    volumeConfirmed: false,
    downgraded: false,
  };
}
