import type { Confidence } from './types';

/**
 * Spec Section 6.2: confidence derived from signal score + volume confirmation
 * + fundamental score thresholds.
 */
export function deriveConfidence(
  signalScore: number | null,
  volumeConfirmed: boolean,
  fundamentalScore: number | null,
): Confidence {
  if (signalScore === null || signalScore < 60) return 'Low';
  if (signalScore >= 80 && volumeConfirmed && fundamentalScore !== null && fundamentalScore >= 70) {
    return 'High';
  }
  return 'Medium';
}
