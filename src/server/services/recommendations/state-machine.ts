import type { Decision, EvaluationContext, RecommendationState } from './types';
import { TERMINAL_STATES } from './types';

const WATCH_EXPIRY_DAYS = 30;

function hitTarget(ctx: EvaluationContext): boolean {
  return ctx.targetPrice !== null && ctx.currentPrice >= ctx.targetPrice;
}

function hitStop(ctx: EvaluationContext): boolean {
  return ctx.stopLoss !== null && ctx.currentPrice <= ctx.stopLoss;
}

function hitTrailingStop(ctx: EvaluationContext): boolean {
  const stop = ctx.trailingStop ?? ctx.stopLoss;
  return stop !== null && ctx.currentPrice <= stop;
}

function priceBelowBrokenMa(ctx: EvaluationContext): boolean {
  if (ctx.brokenMa === 150 && ctx.currentMa150 !== null) {
    return ctx.currentPrice < ctx.currentMa150;
  }
  if (ctx.brokenMa === 200 && ctx.currentMa200 !== null) {
    return ctx.currentPrice < ctx.currentMa200;
  }
  return false;
}

function priceReclaimedMa(ctx: EvaluationContext): boolean {
  if (ctx.brokenMa === 150 && ctx.currentMa150 !== null) {
    return ctx.currentPrice > ctx.currentMa150;
  }
  if (ctx.brokenMa === 200 && ctx.currentMa200 !== null) {
    return ctx.currentPrice > ctx.currentMa200;
  }
  return false;
}

function halfwayToTarget(ctx: EvaluationContext): boolean {
  if (ctx.targetPrice === null) return false;
  const halfway = ctx.entryPrice + (ctx.targetPrice - ctx.entryPrice) * 0.5;
  return ctx.currentPrice >= halfway;
}

function transition(to: RecommendationState, reason: string): Decision {
  return {
    kind: 'transition',
    to,
    reason,
    newTarget: null,
    newStopLoss: null,
    newTrailingStop: null,
  };
}

export function evaluateTransition(current: RecommendationState, ctx: EvaluationContext): Decision {
  if (TERMINAL_STATES.has(current)) return { kind: 'no_change' };

  switch (current) {
    case 'WATCH': {
      if (
        ctx.volumeConfirmed &&
        (ctx.signalStrength === 'strong' || ctx.signalStrength === 'very_strong')
      ) {
        return transition('BUY', 'Signal confirmed (volume + strength)');
      }
      if (ctx.daysInState > WATCH_EXPIRY_DAYS) {
        return transition('EXPIRED', `${WATCH_EXPIRY_DAYS} days without confirmation`);
      }
      return { kind: 'no_change' };
    }

    case 'BUY': {
      if (ctx.daysInState >= 1) {
        return transition('HOLD', 'Day-after follow-through');
      }
      return { kind: 'no_change' };
    }

    case 'HOLD': {
      if (hitTarget(ctx)) {
        return transition('SELL', 'Target reached');
      }
      if (hitStop(ctx)) {
        return transition('STOP_HIT', 'Stop loss hit');
      }
      if (halfwayToTarget(ctx)) {
        return transition('TAKE_PARTIAL_PROFIT', '50% of upside captured');
      }
      if (ctx.fundamentalScore !== null && ctx.fundamentalScore < 50) {
        return transition('DOWNGRADED', 'Fundamental score dropped below 50');
      }
      if (priceBelowBrokenMa(ctx)) {
        return transition('DOWNGRADED', `Price fell back below MA${ctx.brokenMa}`);
      }
      return { kind: 'no_change' };
    }

    case 'TAKE_PARTIAL_PROFIT': {
      if (hitTarget(ctx)) {
        return transition('SELL', 'Target reached after partial profit');
      }
      if (hitTrailingStop(ctx)) {
        return transition('STOP_HIT', 'Trailing stop hit');
      }
      return { kind: 'no_change' };
    }

    case 'DOWNGRADED': {
      if (hitStop(ctx)) {
        return transition('STOP_HIT', 'Stop hit while downgraded');
      }
      if (ctx.fundamentalScore !== null && ctx.fundamentalScore >= 60 && priceReclaimedMa(ctx)) {
        return transition('HOLD', 'Fundamentals recovered and price reclaimed MA');
      }
      return { kind: 'no_change' };
    }

    default:
      return { kind: 'no_change' };
  }
}
