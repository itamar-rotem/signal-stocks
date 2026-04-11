/**
 * Compute the percentile rank (0-100) of `value` within a peer list.
 * Returns 50 for edge cases (empty list, all nulls, null value handled separately).
 *
 * @param value — the value being ranked; null returns null
 * @param peers — the peer universe; nulls are excluded
 * @param options.lowerIsBetter — invert ranking (for valuation metrics)
 */
export function percentileRank(
  value: number | null,
  peers: (number | null)[],
  options: { lowerIsBetter?: boolean } = {},
): number | null {
  if (value === null) return null;

  const cleaned = peers.filter((p): p is number => p !== null);
  if (cleaned.length === 0) return 50;
  if (cleaned.length === 1) return 50;

  const sorted = [...cleaned].sort((a, b) => a - b);
  // Midrank formula scaled to [0, 100]:
  // rank = (below + equal/2 - 0.5) / (n - 1) ensures min=0, max=100, ties=midpoint
  let below = 0;
  let equal = 0;
  for (const peer of sorted) {
    if (peer < value) below++;
    else if (peer === value) equal++;
  }
  const percentile = ((below + equal / 2 - 0.5) / (cleaned.length - 1)) * 100;

  return options.lowerIsBetter ? 100 - percentile : percentile;
}

/**
 * Clamp a raw score to [0, 100]. Null passes through.
 */
export function scoreToPercentile(score: number | null): number | null {
  if (score === null) return null;
  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
}
