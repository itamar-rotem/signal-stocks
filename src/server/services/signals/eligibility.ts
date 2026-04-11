import type { StockContext } from './types';

const ALLOWED_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'AMEX']);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const days = (to.getTime() - from.getTime()) / MS_PER_DAY;
  return days / 30.4375;
}

/**
 * Apply the eligibility gate to a stock.
 * `source === 'system'` uses PRD strict filters.
 * `source === 'watchlist'` uses the relaxed filters.
 */
export function isEligible(ctx: StockContext, lastClose: number, today: string): boolean {
  if (!ALLOWED_EXCHANGES.has(ctx.exchange)) return false;

  if (ctx.source === 'system') {
    if (ctx.marketCap === null || ctx.marketCap < 500_000_000) return false;
    if (ctx.avgDailyVolume20 === null || ctx.avgDailyVolume20 < 500_000) return false;
    if (lastClose < 5) return false;
    if (ctx.fundamentalScore === null || ctx.fundamentalScore < 60) return false;
    if (ctx.listingDate === null) return false;
    if (monthsBetween(ctx.listingDate, today) < 12) return false;
    return true;
  }

  // watchlist
  if (lastClose < 2) return false;
  if (ctx.listingDate === null) return false;
  if (monthsBetween(ctx.listingDate, today) < 6) return false;
  return true;
}
