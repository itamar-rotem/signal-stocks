"""Signal engine: indicators + composite 0-100 score on daily bars.

Pure pandas/numpy — no TA-Lib. The scoring rules below are implemented
exactly as specified; do not "improve" them without an explicit request.

Score recipe (start at 50):
    Trend:      +10 if close>SMA200 else -10
                +8  if SMA50>SMA200 else -8
                direction(close vs SMA50) * clip((ADX14-20)/20, 0, 1) * 12
    Momentum:   +8 if MACD(12,26,9) histogram > 0 else -8
                RSI14: >=70 -> +2 | 50-70 -> +9 | 30-50 -> -5 | <=30 -> -2
    Mean rev:   (close-SMA50)/SMA50 > 0.12 -> -10 ; < -0.12 -> +6
    Volume:     +7 if OBV 20-day change > 0 else -7
    Vol regime: if ATR% (ATR14/close) is in the top 15% of the trailing
                252 sessions: score = 50 + (score-50)*0.5

Signal: BUY >= 65, SELL <= 35, else HOLD.
Hysteresis (backtest/alerts): enter >= 60, exit <= 45.
Risk: stop = entry - 2*ATR14, target = entry + 3*ATR14,
      shares = (account * risk_pct) / (entry - stop).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

# Signal thresholds
BUY_THRESHOLD = 65.0
SELL_THRESHOLD = 35.0
# Hysteresis thresholds for backtests and alerts
ENTER_THRESHOLD = 60.0
EXIT_THRESHOLD = 45.0

COMPONENT_COLUMNS = [
    "c_trend_sma200",
    "c_trend_cross",
    "c_trend_adx",
    "c_mom_macd",
    "c_mom_rsi",
    "c_meanrev",
    "c_volume_obv",
]

COMPONENT_LABELS = {
    "c_trend_sma200": "Trend: close vs SMA200",
    "c_trend_cross": "Trend: SMA50 vs SMA200",
    "c_trend_adx": "Trend: ADX-weighted direction",
    "c_mom_macd": "Momentum: MACD histogram",
    "c_mom_rsi": "Momentum: RSI14 zone",
    "c_meanrev": "Mean reversion: stretch vs SMA50",
    "c_volume_obv": "Volume: OBV 20d change",
}


# ------------------------------------------------------------------ indicators

def sma(series: pd.Series, window: int) -> pd.Series:
    """Simple moving average."""
    return series.rolling(window, min_periods=window).mean()


def ema(series: pd.Series, span: int) -> pd.Series:
    """Exponential moving average (standard span parametrisation)."""
    return series.ewm(span=span, adjust=False).mean()


def rsi(close: pd.Series, window: int = 14) -> pd.Series:
    """Relative Strength Index using Wilder's smoothing."""
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1.0 / window, adjust=False, min_periods=window).mean()
    avg_loss = loss.ewm(alpha=1.0 / window, adjust=False, min_periods=window).mean()
    rs = avg_gain / avg_loss
    out = 100.0 - 100.0 / (1.0 + rs)
    # If there were no losses at all RS is inf -> RSI 100; no gains -> 0.
    out = out.where(avg_loss > 0, 100.0)
    out = out.where((avg_gain > 0) | (avg_loss > 0), 50.0)
    out[avg_gain.isna() | avg_loss.isna()] = np.nan
    return out


def macd(
    close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """MACD line, signal line and histogram."""
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    """True range: max(H-L, |H-prevC|, |L-prevC|)."""
    prev_close = close.shift(1)
    ranges = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    )
    return ranges.max(axis=1)


def atr(high: pd.Series, low: pd.Series, close: pd.Series, window: int = 14) -> pd.Series:
    """Average True Range with Wilder's smoothing."""
    tr = true_range(high, low, close)
    return tr.ewm(alpha=1.0 / window, adjust=False, min_periods=window).mean()


def adx(high: pd.Series, low: pd.Series, close: pd.Series, window: int = 14) -> pd.Series:
    """Average Directional Index (Wilder)."""
    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = pd.Series(
        np.where((up_move > down_move) & (up_move > 0), up_move, 0.0), index=high.index
    )
    minus_dm = pd.Series(
        np.where((down_move > up_move) & (down_move > 0), down_move, 0.0), index=high.index
    )
    tr = true_range(high, low, close)
    alpha = 1.0 / window
    atr_s = tr.ewm(alpha=alpha, adjust=False, min_periods=window).mean()
    plus_di = 100.0 * plus_dm.ewm(alpha=alpha, adjust=False, min_periods=window).mean() / atr_s
    minus_di = 100.0 * minus_dm.ewm(alpha=alpha, adjust=False, min_periods=window).mean() / atr_s
    di_sum = plus_di + minus_di
    dx = 100.0 * (plus_di - minus_di).abs() / di_sum.replace(0.0, np.nan)
    return dx.ewm(alpha=alpha, adjust=False, min_periods=window).mean()


def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """On-Balance Volume."""
    direction = np.sign(close.diff()).fillna(0.0)
    return (direction * volume).cumsum()


# ------------------------------------------------------------------- pipeline

def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Add all indicator columns to an OHLCV frame.

    Expects lowercase columns: open, high, low, close, volume.
    """
    out = df.copy()
    close, high, low, volume = out["close"], out["high"], out["low"], out["volume"]
    out["sma50"] = sma(close, 50)
    out["sma200"] = sma(close, 200)
    out["rsi14"] = rsi(close, 14)
    _, _, out["macd_hist"] = macd(close)
    out["adx14"] = adx(high, low, close, 14)
    out["atr14"] = atr(high, low, close, 14)
    out["atr_pct"] = out["atr14"] / close
    out["obv"] = obv(close, volume)
    out["obv_chg20"] = out["obv"].diff(20)
    return out


def score_components(ind: pd.DataFrame) -> pd.DataFrame:
    """Compute each score component from an indicator frame.

    Returns a frame with one column per component (see COMPONENT_COLUMNS)
    plus ``raw_score`` (pre volatility dampening), ``score`` and ``vol_dampened``.
    Rows without a valid SMA200 (warm-up) get NaN scores.
    """
    close = ind["close"]
    idx = ind.index

    trend_sma200 = pd.Series(np.where(close > ind["sma200"], 10.0, -10.0), index=idx)
    trend_cross = pd.Series(np.where(ind["sma50"] > ind["sma200"], 8.0, -8.0), index=idx)

    direction = pd.Series(np.where(close > ind["sma50"], 1.0, -1.0), index=idx)
    adx_strength = ((ind["adx14"] - 20.0) / 20.0).clip(lower=0.0, upper=1.0)
    trend_adx = direction * adx_strength.fillna(0.0) * 12.0

    mom_macd = pd.Series(np.where(ind["macd_hist"] > 0, 8.0, -8.0), index=idx)

    r = ind["rsi14"]
    mom_rsi = pd.Series(
        np.select([r >= 70.0, r >= 50.0, r > 30.0], [2.0, 9.0, -5.0], default=-2.0),
        index=idx,
    )

    stretch = (close - ind["sma50"]) / ind["sma50"]
    meanrev = pd.Series(
        np.select([stretch > 0.12, stretch < -0.12], [-10.0, 6.0], default=0.0), index=idx
    )

    volume_obv = pd.Series(np.where(ind["obv_chg20"] > 0, 7.0, -7.0), index=idx)

    comp = pd.DataFrame(
        {
            "c_trend_sma200": trend_sma200,
            "c_trend_cross": trend_cross,
            "c_trend_adx": trend_adx,
            "c_mom_macd": mom_macd,
            "c_mom_rsi": mom_rsi,
            "c_meanrev": meanrev,
            "c_volume_obv": volume_obv,
        }
    )
    raw = 50.0 + comp.sum(axis=1)

    # Volatility regime: dampen conviction when ATR% is in the top 15%
    # of the trailing 252 sessions.
    atr_pct_threshold = ind["atr_pct"].rolling(252, min_periods=252).quantile(0.85)
    high_vol = (ind["atr_pct"] >= atr_pct_threshold) & atr_pct_threshold.notna()
    score = pd.Series(np.where(high_vol, 50.0 + (raw - 50.0) * 0.5, raw), index=idx)
    score = score.clip(0.0, 100.0)

    # Mask warm-up rows: without SMA200 the score is not meaningful.
    valid = ind["sma200"].notna()
    comp = comp.where(valid)
    comp["raw_score"] = raw.where(valid)
    comp["score"] = score.where(valid)
    comp["vol_dampened"] = high_vol & valid
    return comp


def compute_scores(ohlcv: pd.DataFrame) -> pd.DataFrame:
    """Full pipeline: OHLCV -> indicators + components + score + signal."""
    ind = compute_indicators(ohlcv)
    comp = score_components(ind)
    out = pd.concat([ind, comp], axis=1)
    out["signal"] = classify(out["score"])
    return out


def classify(score: pd.Series | float) -> pd.Series | str:
    """Map score(s) to BUY / SELL / HOLD labels."""
    if isinstance(score, pd.Series):
        labels = pd.Series(
            np.select(
                [score >= BUY_THRESHOLD, score <= SELL_THRESHOLD],
                ["BUY", "SELL"],
                default="HOLD",
            ),
            index=score.index,
            dtype=object,
        )
        labels[score.isna()] = None
        return labels
    if score is None or (isinstance(score, float) and math.isnan(score)):
        return "HOLD"
    if score >= BUY_THRESHOLD:
        return "BUY"
    if score <= SELL_THRESHOLD:
        return "SELL"
    return "HOLD"


def hysteresis_positions(
    score: pd.Series,
    enter: float = ENTER_THRESHOLD,
    exit_: float = EXIT_THRESHOLD,
) -> pd.Series:
    """Long/flat position series with hysteresis.

    Enter (1) when score >= ``enter``; exit (0) when score <= ``exit_``;
    otherwise hold the previous state. NaN scores keep the prior state
    (flat during warm-up).
    """
    values = score.to_numpy(dtype=float)
    pos = np.zeros(len(values), dtype=int)
    state = 0
    for i, s in enumerate(values):
        if not math.isnan(s):
            if state == 0 and s >= enter:
                state = 1
            elif state == 1 and s <= exit_:
                state = 0
        pos[i] = state
    return pd.Series(pos, index=score.index, name="position")


# ------------------------------------------------------------------------ risk

@dataclass(frozen=True)
class TradePlan:
    """Entry/stop/target and position size for a BUY signal."""

    entry: float
    stop: float
    target: float
    shares: int
    risk_amount: float
    risk_per_share: float


def trade_plan(
    entry: float, atr14: float, account_size: float, risk_pct: float
) -> Optional[TradePlan]:
    """stop = entry - 2*ATR14, target = entry + 3*ATR14,
    shares = (account * risk_pct) / (entry - stop).

    ``risk_pct`` is a fraction (0.01 == 1%). Returns None when inputs are
    invalid (non-positive entry/ATR).
    """
    if entry is None or atr14 is None:
        return None
    if not (entry > 0) or not (atr14 > 0):
        return None
    stop = entry - 2.0 * atr14
    target = entry + 3.0 * atr14
    risk_per_share = entry - stop  # == 2*ATR14
    risk_amount = account_size * risk_pct
    shares = int(risk_amount / risk_per_share)
    return TradePlan(
        entry=entry,
        stop=stop,
        target=target,
        shares=shares,
        risk_amount=risk_amount,
        risk_per_share=risk_per_share,
    )
