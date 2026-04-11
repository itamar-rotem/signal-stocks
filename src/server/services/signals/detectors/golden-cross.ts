import type { PriceBar, DetectedSignal } from '../types';

export function detectGoldenCross(bars: PriceBar[]): DetectedSignal | null {
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2];
  const curr = bars[bars.length - 1];
  if (prev.ma150 === null || prev.ma200 === null || curr.ma150 === null || curr.ma200 === null) {
    return null;
  }
  const crossed = prev.ma150 <= prev.ma200 && curr.ma150 > curr.ma200;
  if (!crossed) return null;
  if (curr.close <= curr.ma150 || curr.close <= curr.ma200) return null;

  return {
    signalType: 'SIG-06',
    strength: 'very_strong',
    triggeredAt: curr.date,
    volumeConfirmed: false,
    downgraded: false,
  };
}
