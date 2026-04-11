import type { PriceBar, DetectedSignal } from '../types';
import { detectMaBreakout } from './ma200-breakout';

export function detectMa150Breakout(bars: PriceBar[]): DetectedSignal | null {
  return detectMaBreakout(bars, 'ma150', 'SIG-04');
}
