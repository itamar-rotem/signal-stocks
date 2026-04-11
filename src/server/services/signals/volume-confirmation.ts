import type { PriceBar } from './types';

export const VOLUME_LOOKBACK = 20;
export const VOLUME_MULTIPLIER = 1.5;

/**
 * Average volume over the `lookback` bars strictly before `index`.
 * Returns null when there is insufficient history.
 */
export function computeAvgVolume(
  bars: PriceBar[],
  index: number,
  lookback: number = VOLUME_LOOKBACK,
): number | null {
  if (index < lookback) return null;
  let sum = 0;
  for (let i = index - lookback; i < index; i++) {
    sum += bars[i].volume;
  }
  return sum / lookback;
}

/**
 * A breakout at `index` is volume-confirmed when current volume >= 1.5x the
 * 20-bar trailing average.
 */
export function isVolumeConfirmed(bars: PriceBar[], index: number): boolean {
  const avg = computeAvgVolume(bars, index);
  if (avg === null) return false;
  return bars[index].volume >= avg * VOLUME_MULTIPLIER;
}
