import type { PriceBar, DetectedSignal } from '../types';

export const APPROACH_PCT = 0.02;

/**
 * SIG-01 MA200 Approaching.
 * Trigger: latest close is within 2% below MA200 and MA200 slope is positive.
 */
export function detectMa200Approaching(bars: PriceBar[]): DetectedSignal | null {
  if (bars.length === 0) return null;
  const last = bars[bars.length - 1];
  if (last.ma200 === null || last.ma200Slope === null) return null;
  if (last.close >= last.ma200) return null;
  const pctBelow = (last.ma200 - last.close) / last.ma200;
  if (pctBelow > APPROACH_PCT) return null;
  if (last.ma200Slope <= 0) return null;

  return {
    signalType: 'SIG-01',
    strength: 'medium',
    triggeredAt: last.date,
    volumeConfirmed: false,
    downgraded: false,
  };
}
