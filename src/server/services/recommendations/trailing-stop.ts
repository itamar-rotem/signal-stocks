export interface TrailingStopInput {
  entryPrice: number;
  currentPrice: number;
  highestCloseSinceEntry: number;
  atr14: number | null;
  currentStopLoss: number | null;
}

const BREAKEVEN_GAIN = 0.05;
const PROFIT_LOCK_GAIN = 0.1;
const PROFIT_LOCK_OFFSET = 0.05;
const ATR_MULTIPLIER = 2;

export function computeTrailingStop(input: TrailingStopInput): number {
  const { entryPrice, currentPrice, highestCloseSinceEntry, atr14, currentStopLoss } =
    input;
  const gainPct = (currentPrice - entryPrice) / entryPrice;

  const candidates: number[] = [];

  if (gainPct >= BREAKEVEN_GAIN) {
    candidates.push(entryPrice);
  }
  if (gainPct >= PROFIT_LOCK_GAIN) {
    candidates.push(entryPrice * (1 + PROFIT_LOCK_OFFSET));
  }
  if (atr14 !== null && atr14 > 0) {
    candidates.push(highestCloseSinceEntry - ATR_MULTIPLIER * atr14);
  }
  if (currentStopLoss !== null) {
    candidates.push(currentStopLoss);
  }

  if (candidates.length === 0) {
    return currentStopLoss ?? -Infinity;
  }
  return Math.max(...candidates);
}
