/**
 * Target price heuristic (Phase 7 simplification — full spec 4.5 integration
 * with analyst targets is deferred).
 *
 * upsidePct = max(5%, score/100 × 20%)
 * target    = entry × (1 + upsidePct)
 */
export function initialTarget(entryPrice: number, signalScore: number | null): number | null {
  if (signalScore === null) return null;
  const raw = (signalScore / 100) * 0.2;
  const upsidePct = Math.max(0.05, raw);
  return entryPrice * (1 + upsidePct);
}

const STOP_OFFSET_PCT = 0.04;
const MAX_STOP_PCT = 0.1;

/**
 * Stop loss heuristic:
 * - Compute raw stop = maLevel × (1 - 4%)
 * - Cap so stop ≥ entry × (1 - 10%)
 */
export function initialStopLoss(
  entryPrice: number,
  _maKind: 150 | 200,
  maLevel: number | null,
): number | null {
  if (maLevel === null) return null;
  const rawStop = maLevel * (1 - STOP_OFFSET_PCT);
  const floor = entryPrice * (1 - MAX_STOP_PCT);
  return Math.max(rawStop, floor);
}
