export type RecommendationState =
  | 'WATCH'
  | 'BUY'
  | 'HOLD'
  | 'TAKE_PARTIAL_PROFIT'
  | 'SELL'
  | 'STOP_HIT'
  | 'DOWNGRADED'
  | 'EXPIRED';

export interface EvaluationContext {
  entryPrice: number;
  currentPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  trailingStop: number | null;
  highestCloseSinceEntry: number;
  atr14: number | null;
  daysSinceEntry: number;
  daysInState: number;
  volumeConfirmed: boolean;
  fundamentalScore: number | null;
  signalStrength: 'medium' | 'strong' | 'very_strong';
  brokenMa: 150 | 200 | null;
  currentMa150: number | null;
  currentMa200: number | null;
}

export type Decision =
  | { kind: 'no_change' }
  | {
      kind: 'transition';
      to: RecommendationState;
      reason: string;
      newTarget: number | null;
      newStopLoss: number | null;
      newTrailingStop: number | null;
    };

export const TERMINAL_STATES: ReadonlySet<RecommendationState> = new Set([
  'SELL',
  'STOP_HIT',
  'EXPIRED',
]);
