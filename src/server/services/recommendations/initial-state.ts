import type { RecommendationState } from './types';

export function deriveInitialState(
  strength: 'medium' | 'strong' | 'very_strong',
  volumeConfirmed: boolean,
): RecommendationState {
  if (volumeConfirmed && (strength === 'strong' || strength === 'very_strong')) {
    return 'BUY';
  }
  return 'WATCH';
}
