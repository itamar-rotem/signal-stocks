/**
 * Simple moving average over a numeric series.
 * Returns an array the same length as input; positions before the window
 * is fully populated are null.
 *
 * @param closes - series of close prices in chronological (ascending) order
 * @param window - window size (e.g. 150, 200)
 */
export function computeSMA(
  closes: number[],
  window: number,
): (number | null)[] {
  if (window <= 0) {
    throw new Error(`computeSMA: window must be positive, got ${window}`);
  }
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < window) return result;

  let runningSum = 0;
  for (let i = 0; i < window; i++) {
    runningSum += closes[i];
  }
  result[window - 1] = runningSum / window;

  for (let i = window; i < closes.length; i++) {
    runningSum += closes[i] - closes[i - window];
    result[i] = runningSum / window;
  }

  return result;
}

/**
 * Per-period slope of a (possibly sparse) series over a fixed lookback.
 * For each position i, computes (series[i] - series[i - lookback]) / lookback.
 * Returns null where either endpoint is null or the lookback is not yet
 * available.
 *
 * @param series - values in chronological order; may contain nulls
 * @param lookback - number of periods to look back (e.g. 5 for a 5-day slope)
 */
export function computeSlope(
  series: (number | null)[],
  lookback: number,
): (number | null)[] {
  if (lookback <= 0) {
    throw new Error(`computeSlope: lookback must be positive, got ${lookback}`);
  }
  const result: (number | null)[] = new Array(series.length).fill(null);
  for (let i = lookback; i < series.length; i++) {
    const current = series[i];
    const past = series[i - lookback];
    if (current === null || past === null) continue;
    result[i] = (current - past) / lookback;
  }
  return result;
}
