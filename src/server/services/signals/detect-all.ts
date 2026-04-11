import type { PriceBar, DetectedSignal, SignalStrength, SignalType } from './types';
import { isVolumeConfirmed } from './volume-confirmation';
import {
  detectMa200Approaching,
  detectMa150Approaching,
  detectMa200Breakout,
  detectMa150Breakout,
  detectDualMaBreakout,
  detectGoldenCross,
  detectSupportBounce,
} from './detectors';

const BREAKOUT_SIGNALS: ReadonlySet<SignalType> = new Set(['SIG-02', 'SIG-04', 'SIG-05', 'SIG-06']);

export function downgradeStrength(s: SignalStrength): SignalStrength {
  if (s === 'very_strong') return 'strong';
  if (s === 'strong') return 'medium';
  return 'medium';
}

export function detectAllSignals(bars: PriceBar[]): DetectedSignal[] {
  const raw = [
    detectMa200Approaching(bars),
    detectMa150Approaching(bars),
    detectMa200Breakout(bars),
    detectMa150Breakout(bars),
    detectDualMaBreakout(bars),
    detectGoldenCross(bars),
    detectSupportBounce(bars),
  ].filter((s): s is DetectedSignal => s !== null);

  const lastIdx = bars.length - 1;

  return raw.map((sig) => {
    if (!BREAKOUT_SIGNALS.has(sig.signalType)) {
      return sig;
    }
    const confirmed = isVolumeConfirmed(bars, lastIdx);
    if (confirmed) {
      return { ...sig, volumeConfirmed: true };
    }
    return {
      ...sig,
      volumeConfirmed: false,
      downgraded: true,
      strength: downgradeStrength(sig.strength),
    };
  });
}
