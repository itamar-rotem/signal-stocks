import type { PriceBar, DetectedSignal } from '../types';
import { APPROACH_PCT } from './ma200-approaching';

export function detectMa150Approaching(bars: PriceBar[]): DetectedSignal | null {
  if (bars.length === 0) return null;
  const last = bars[bars.length - 1];
  if (last.ma150 === null || last.ma150Slope === null) return null;
  if (last.close >= last.ma150) return null;
  const pctBelow = (last.ma150 - last.close) / last.ma150;
  if (pctBelow > APPROACH_PCT) return null;
  if (last.ma150Slope <= 0) return null;

  return {
    signalType: 'SIG-03',
    strength: 'medium',
    triggeredAt: last.date,
    volumeConfirmed: false,
    downgraded: false,
  };
}
