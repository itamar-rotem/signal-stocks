"""Screener: rank a universe of stocks for long/short swing candidates.

Universe: S&P 500 (Wikipedia constituents + GICS sector) or a custom list.
Liquidity filters: price > $5 and 20-day average dollar volume > $20M.

Ranking:
    long_rank  = 0.35*pctile(score) + 0.25*pctile(6m return)
               + 0.20*pctile(3m return minus SPY 3m return)
               + 0.20*pctile(price / 52-week high)
    short_rank = 1 - long_rank
Penalties (applied after the base rank):
    longs below SMA200 or with RSI > 75  -> -0.25
    shorts above SMA200 or with RSI < 25 -> -0.25

Sector-neutral mode caps picks at 2 per GICS sector. Every pick gets a
plain-English reason string. A separate daily "movers" scan flags
relative volume >= 3x the 20-day average or an opening gap >= 4%.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

import signals as sig

MIN_PRICE = 5.0
MIN_DOLLAR_VOLUME = 20_000_000.0  # 20d average
RANK_PENALTY = 0.25
LONG_RSI_PENALTY_LEVEL = 75.0
SHORT_RSI_PENALTY_LEVEL = 25.0
MOVER_REL_VOLUME = 3.0
MOVER_GAP_PCT = 0.04
MAX_PER_SECTOR_NEUTRAL = 2

TRADING_DAYS_6M = 126
TRADING_DAYS_3M = 63


def pctile(series: pd.Series) -> pd.Series:
    """Cross-sectional percentile rank in [0, 1]."""
    return series.rank(pct=True)


# ------------------------------------------------------------------ features

def build_features(
    data: dict[str, pd.DataFrame],
    spy: pd.DataFrame,
    sectors: Optional[dict[str, str]] = None,
) -> pd.DataFrame:
    """One row of screening features per ticker from daily OHLCV frames."""
    spy_ret_3m = np.nan
    if spy is not None and len(spy) > TRADING_DAYS_3M:
        spy_ret_3m = float(
            spy["close"].iloc[-1] / spy["close"].iloc[-1 - TRADING_DAYS_3M] - 1.0
        )

    rows: list[dict] = []
    for ticker, df in data.items():
        if df is None or len(df) < 210:  # need SMA200 + a little slack
            continue
        scored = sig.compute_scores(df)
        last = scored.iloc[-1]
        close = float(last["close"])
        if np.isnan(last["score"]):
            continue

        ret_6m = (
            close / float(df["close"].iloc[-1 - TRADING_DAYS_6M]) - 1.0
            if len(df) > TRADING_DAYS_6M
            else np.nan
        )
        ret_3m = (
            close / float(df["close"].iloc[-1 - TRADING_DAYS_3M]) - 1.0
            if len(df) > TRADING_DAYS_3M
            else np.nan
        )
        high_52w = float(df["high"].tail(252).max())
        adv20 = float((df["close"] * df["volume"]).tail(20).mean())
        vol20 = float(df["volume"].tail(20).mean())
        rel_volume = float(df["volume"].iloc[-1]) / vol20 if vol20 > 0 else np.nan
        gap = (
            float(df["open"].iloc[-1]) / float(df["close"].iloc[-2]) - 1.0
            if len(df) >= 2
            else np.nan
        )

        rows.append(
            {
                "ticker": ticker,
                "sector": (sectors or {}).get(ticker, "Unknown"),
                "price": close,
                "score": float(last["score"]),
                "signal": last["signal"],
                "rsi14": float(last["rsi14"]),
                "atr14": float(last["atr14"]),
                "above_sma200": bool(close > float(last["sma200"])),
                "ret_6m": ret_6m,
                "ret_3m": ret_3m,
                "rel_ret_3m": ret_3m - spy_ret_3m if not np.isnan(spy_ret_3m) else ret_3m,
                "pct_52w_high": close / high_52w if high_52w > 0 else np.nan,
                "adv20_dollar": adv20,
                "rel_volume": rel_volume,
                "gap": gap,
                "vol_dampened": bool(last["vol_dampened"]),
            }
        )
    return pd.DataFrame(rows).set_index("ticker") if rows else pd.DataFrame()


def apply_liquidity_filters(features: pd.DataFrame) -> pd.DataFrame:
    """price > $5 and 20d average dollar volume > $20M."""
    if features.empty:
        return features
    mask = (features["price"] > MIN_PRICE) & (features["adv20_dollar"] > MIN_DOLLAR_VOLUME)
    return features[mask].copy()


# -------------------------------------------------------------------- ranking

def rank_universe(features: pd.DataFrame) -> pd.DataFrame:
    """Add long_rank / short_rank columns (with penalties) to a feature frame."""
    if features.empty:
        return features
    out = features.copy()
    base = (
        0.35 * pctile(out["score"])
        + 0.25 * pctile(out["ret_6m"])
        + 0.20 * pctile(out["rel_ret_3m"])
        + 0.20 * pctile(out["pct_52w_high"])
    )
    out["base_long_rank"] = base

    long_penalty = np.where(
        (~out["above_sma200"]) | (out["rsi14"] > LONG_RSI_PENALTY_LEVEL), RANK_PENALTY, 0.0
    )
    short_penalty = np.where(
        (out["above_sma200"]) | (out["rsi14"] < SHORT_RSI_PENALTY_LEVEL), RANK_PENALTY, 0.0
    )
    out["long_rank"] = base - long_penalty
    out["short_rank"] = (1.0 - base) - short_penalty
    return out


def sector_neutral_picks(
    ranked: pd.DataFrame, rank_col: str, top_n: int, max_per_sector: int = MAX_PER_SECTOR_NEUTRAL
) -> pd.DataFrame:
    """Top-N by rank with at most ``max_per_sector`` picks per GICS sector."""
    picks: list[str] = []
    counts: dict[str, int] = {}
    for ticker, row in ranked.sort_values(rank_col, ascending=False).iterrows():
        sector = row.get("sector", "Unknown")
        if counts.get(sector, 0) >= max_per_sector:
            continue
        picks.append(ticker)
        counts[sector] = counts.get(sector, 0) + 1
        if len(picks) >= top_n:
            break
    return ranked.loc[picks]


# -------------------------------------------------------------------- reasons

def long_reason(row: pd.Series) -> str:
    """Plain-English explanation of why a stock ranks as a long candidate."""
    parts: list[str] = []
    parts.append(f"Composite score {row['score']:.0f}/100 ({row['signal']}).")
    if row["above_sma200"]:
        parts.append("Trading above its 200-day average (long-term uptrend).")
    else:
        parts.append("Below its 200-day average — rank penalized.")
    if not np.isnan(row["ret_6m"]):
        parts.append(f"{row['ret_6m'] * 100:+.0f}% over 6 months.")
    if not np.isnan(row["rel_ret_3m"]):
        beat = "ahead of" if row["rel_ret_3m"] > 0 else "behind"
        parts.append(f"3-month return {beat} SPY by {abs(row['rel_ret_3m']) * 100:.0f}pp.")
    if not np.isnan(row["pct_52w_high"]):
        parts.append(f"At {row['pct_52w_high'] * 100:.0f}% of its 52-week high.")
    if row["rsi14"] > LONG_RSI_PENALTY_LEVEL:
        parts.append(f"RSI {row['rsi14']:.0f} is overbought — rank penalized.")
    if row.get("vol_dampened"):
        parts.append("Volatility elevated — score conviction halved.")
    return " ".join(parts)


def short_reason(row: pd.Series) -> str:
    """Plain-English explanation of why a stock ranks as a short candidate."""
    parts: list[str] = []
    parts.append(f"Composite score {row['score']:.0f}/100 ({row['signal']}).")
    if not row["above_sma200"]:
        parts.append("Below its 200-day average (long-term downtrend).")
    else:
        parts.append("Still above its 200-day average — rank penalized.")
    if not np.isnan(row["ret_6m"]):
        parts.append(f"{row['ret_6m'] * 100:+.0f}% over 6 months.")
    if not np.isnan(row["rel_ret_3m"]):
        beat = "ahead of" if row["rel_ret_3m"] > 0 else "behind"
        parts.append(f"3-month return {beat} SPY by {abs(row['rel_ret_3m']) * 100:.0f}pp.")
    if row["rsi14"] < SHORT_RSI_PENALTY_LEVEL:
        parts.append(f"RSI {row['rsi14']:.0f} is oversold — rank penalized.")
    if row.get("vol_dampened"):
        parts.append("Volatility elevated — score conviction halved.")
    return " ".join(parts)


# --------------------------------------------------------------------- movers

def find_movers(features: pd.DataFrame) -> pd.DataFrame:
    """Daily movers: relative volume >= 3x 20d average or |gap| >= 4%."""
    if features.empty:
        return features
    mask = (features["rel_volume"] >= MOVER_REL_VOLUME) | (
        features["gap"].abs() >= MOVER_GAP_PCT
    )
    movers = features[mask].copy()
    if movers.empty:
        return movers

    def why(row: pd.Series) -> str:
        bits = []
        if row["rel_volume"] >= MOVER_REL_VOLUME:
            bits.append(f"volume {row['rel_volume']:.1f}x its 20d average")
        if abs(row["gap"]) >= MOVER_GAP_PCT:
            direction = "up" if row["gap"] > 0 else "down"
            bits.append(f"gapped {direction} {abs(row['gap']) * 100:.1f}%")
        return "Mover: " + " and ".join(bits) + "."

    movers["mover_reason"] = movers.apply(why, axis=1)
    return movers.sort_values("rel_volume", ascending=False)


# ----------------------------------------------------------------- entry point

@dataclass
class ScreenerResult:
    longs: pd.DataFrame
    shorts: pd.DataFrame
    movers: pd.DataFrame
    table: pd.DataFrame  # full ranked universe post-filters
    universe_size: int = 0
    filtered_size: int = 0
    notes: list[str] = field(default_factory=list)


def run_screener(
    data: dict[str, pd.DataFrame],
    spy: pd.DataFrame,
    sectors: Optional[dict[str, str]] = None,
    top_n: int = 10,
    sector_neutral: bool = False,
) -> ScreenerResult:
    """Rank a universe and return long picks, short picks and movers."""
    features = build_features(data, spy, sectors)
    universe_size = len(features)
    filtered = apply_liquidity_filters(features)
    ranked = rank_universe(filtered)

    notes: list[str] = []
    if universe_size and len(filtered) < universe_size:
        notes.append(
            f"{universe_size - len(filtered)} tickers dropped by liquidity filters "
            f"(price > ${MIN_PRICE:.0f}, 20d avg dollar volume > ${MIN_DOLLAR_VOLUME / 1e6:.0f}M)."
        )

    if ranked.empty:
        empty = pd.DataFrame()
        return ScreenerResult(empty, empty, empty, ranked, universe_size, 0, notes)

    if sector_neutral:
        longs = sector_neutral_picks(ranked, "long_rank", top_n)
        shorts = sector_neutral_picks(ranked, "short_rank", top_n)
        notes.append(f"Sector-neutral mode: max {MAX_PER_SECTOR_NEUTRAL} picks per GICS sector.")
    else:
        longs = ranked.sort_values("long_rank", ascending=False).head(top_n)
        shorts = ranked.sort_values("short_rank", ascending=False).head(top_n)

    longs = longs.copy()
    shorts = shorts.copy()
    longs["reason"] = longs.apply(long_reason, axis=1)
    shorts["reason"] = shorts.apply(short_reason, axis=1)

    return ScreenerResult(
        longs=longs,
        shorts=shorts,
        movers=find_movers(ranked),
        table=ranked.sort_values("long_rank", ascending=False),
        universe_size=universe_size,
        filtered_size=len(filtered),
        notes=notes,
    )
