import type { SignalStrength } from './types';

export function strengthValue(s: SignalStrength): number {
  if (s === 'very_strong') return 100;
  if (s === 'strong') return 75;
  return 50;
}

export function volumeValue(confirmed: boolean): number {
  return confirmed ? 100 : 50;
}

/**
 * Composite signal score = fundamental*0.5 + technical*0.3 + volume*0.2
 * Returns null when fundamental score is unavailable (a signal can't be scored
 * without fundamentals).
 */
export function computeSignalScore(
  fundamentalScore: number | null,
  strength: SignalStrength,
  volumeConfirmed: boolean,
): number | null {
  if (fundamentalScore === null) return null;
  return (
    fundamentalScore * 0.5 + strengthValue(strength) * 0.3 + volumeValue(volumeConfirmed) * 0.2
  );
}
