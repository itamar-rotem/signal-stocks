/**
 * Formatting helpers for the ops console UI.
 */

/** Format a number as USD: $102.45 */
export function fmtUsd(n: number): string {
  return '$' + n.toFixed(2);
}

/** Format a percentage with sign: +17.5% or -3.2% */
export function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(1) + '%';
}

/** Format P&L with sign; returns { text: "+$417.00", isPositive: boolean } */
export function fmtPnl(n: number): { text: string; isPositive: boolean } {
  const sign = n >= 0 ? '+' : '-';
  return { text: sign + '$' + Math.abs(n).toFixed(2), isPositive: n >= 0 };
}

/**
 * Format a date as a relative time string.
 * < 60s  → "just now"
 * < 60m  → "Nm ago"
 * < 24h  → "Nh ago"
 * < 7d   → "Nd ago"
 * else   → "YYYY-MM-DD"
 */
export function fmtRelTime(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toISOString().slice(0, 10);
}
