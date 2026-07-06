"""Trade journal & positions: entries, exits, skips, stats and equity curve.

All persistence goes through db.py. Stats implemented here:
win rate, average R, expectancy (in R), monthly P&L, equity curve vs SPY.
R-multiple of a trade = (exit - entry) / (entry - stop).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

import db


# --------------------------------------------------------------------- logging

def log_entry(
    ticker: str,
    price: float,
    shares: float,
    stop: Optional[float],
    target: Optional[float],
    score: Optional[float] = None,
    sector: Optional[str] = None,
    notes: Optional[str] = None,
    entry_date: Optional[str] = None,
    db_path: Optional[str] = None,
) -> int:
    """Open a position and journal the entry. Returns the position id."""
    position_id = db.open_position(
        ticker, price, shares, stop=stop, target=target, sector=sector,
        entry_date=entry_date, notes=notes, db_path=db_path,
    )
    db.journal_event(
        ticker, "entry", price=price, shares=shares, score=score,
        details={"position_id": position_id, "stop": stop, "target": target,
                 "sector": sector, "notes": notes},
        ts=entry_date, db_path=db_path,
    )
    return position_id


def log_exit(
    position_id: int,
    price: float,
    reason: str = "",
    exit_date: Optional[str] = None,
    db_path: Optional[str] = None,
) -> None:
    """Close a position and journal the exit."""
    positions = {p["id"]: p for p in db.get_open_positions(db_path)}
    pos = positions.get(position_id)
    if pos is None:
        raise ValueError(f"No open position with id {position_id}")
    db.close_position(position_id, price, exit_date=exit_date, db_path=db_path)
    db.journal_event(
        pos["ticker"], "exit", price=price, shares=pos["shares"],
        details={"position_id": position_id, "reason": reason,
                 "r_multiple": r_multiple(pos["entry_price"], price, pos["stop"])},
        ts=exit_date, db_path=db_path,
    )


def log_skip(
    ticker: str,
    reason: str,
    score: Optional[float] = None,
    price: Optional[float] = None,
    db_path: Optional[str] = None,
) -> None:
    """Journal a signal that was deliberately not taken."""
    db.journal_event(ticker, "skip", price=price, score=score,
                     details={"reason": reason}, db_path=db_path)


# ----------------------------------------------------------------------- math

def r_multiple(entry: float, exit_price: float, stop: Optional[float]) -> Optional[float]:
    """R-multiple of a long trade; None when no stop was recorded."""
    if stop is None or entry is None or exit_price is None:
        return None
    risk = entry - stop
    if risk <= 0:
        return None
    return (exit_price - entry) / risk


def position_pnl(pos: dict, current_price: Optional[float]) -> dict:
    """Live P&L view of one open position (long)."""
    entry = float(pos["entry_price"])
    shares = float(pos["shares"])
    price = float(current_price) if current_price is not None else np.nan
    pnl = (price - entry) * shares if not np.isnan(price) else np.nan
    pnl_pct = price / entry - 1.0 if not np.isnan(price) else np.nan
    r = r_multiple(entry, price, pos.get("stop")) if not np.isnan(price) else None
    return {
        "id": pos["id"],
        "ticker": pos["ticker"],
        "sector": pos.get("sector"),
        "entry_date": pos["entry_date"],
        "entry": entry,
        "shares": shares,
        "stop": pos.get("stop"),
        "target": pos.get("target"),
        "price": price,
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "r_multiple": r,
    }


def open_positions_view(
    prices: dict[str, Optional[float]], db_path: Optional[str] = None
) -> pd.DataFrame:
    """All open positions with live P&L and R-multiples."""
    rows = [position_pnl(p, prices.get(p["ticker"])) for p in db.get_open_positions(db_path)]
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------- stats

def closed_trades_frame(db_path: Optional[str] = None) -> pd.DataFrame:
    """Closed positions as a frame with pnl and r_multiple columns."""
    closed = db.get_closed_positions(db_path)
    if not closed:
        return pd.DataFrame(
            columns=["ticker", "entry_date", "exit_date", "entry_price",
                     "exit_price", "shares", "pnl", "r_multiple"]
        )
    df = pd.DataFrame(closed)
    df["pnl"] = (df["exit_price"] - df["entry_price"]) * df["shares"]
    df["r_multiple"] = df.apply(
        lambda r: r_multiple(r["entry_price"], r["exit_price"], r["stop"]), axis=1
    )
    df["exit_date"] = pd.to_datetime(df["exit_date"], format="mixed", utc=True).dt.tz_localize(None)
    df["entry_date"] = pd.to_datetime(df["entry_date"], format="mixed", utc=True).dt.tz_localize(None)
    return df


def stats(db_path: Optional[str] = None) -> dict:
    """Win rate, average R, expectancy, trade counts over closed trades."""
    trades = closed_trades_frame(db_path)
    n = len(trades)
    if n == 0:
        return {"trades": 0, "win_rate": np.nan, "avg_r": np.nan,
                "expectancy_r": np.nan, "total_pnl": 0.0}
    wins = trades[trades["pnl"] > 0]
    losses = trades[trades["pnl"] <= 0]
    win_rate = len(wins) / n
    r_values = trades["r_multiple"].dropna()
    avg_r = float(r_values.mean()) if len(r_values) else np.nan
    avg_win_r = float(wins["r_multiple"].dropna().mean()) if len(wins) else 0.0
    avg_loss_r = float(losses["r_multiple"].dropna().mean()) if len(losses) else 0.0
    expectancy = win_rate * avg_win_r + (1 - win_rate) * avg_loss_r
    return {
        "trades": n,
        "win_rate": win_rate,
        "avg_r": avg_r,
        "avg_win_r": avg_win_r,
        "avg_loss_r": avg_loss_r,
        "expectancy_r": expectancy,
        "total_pnl": float(trades["pnl"].sum()),
    }


def monthly_pnl(db_path: Optional[str] = None) -> pd.DataFrame:
    """Realized P&L per calendar month (from closed trades)."""
    trades = closed_trades_frame(db_path)
    if trades.empty:
        return pd.DataFrame(columns=["month", "pnl", "trades"])
    grouped = trades.groupby(trades["exit_date"].dt.to_period("M"))
    out = grouped.agg(pnl=("pnl", "sum"), trades=("pnl", "size")).reset_index()
    out["month"] = out["exit_date"].astype(str)
    return out[["month", "pnl", "trades"]]


def current_month_pnl_pct(
    account_size: float, db_path: Optional[str] = None, now: Optional[datetime] = None
) -> float:
    """Realized P&L this calendar month as a fraction of account size.

    Feeds the circuit breaker (block new entries at <= -5%).
    """
    if account_size <= 0:
        return 0.0
    trades = closed_trades_frame(db_path)
    if trades.empty:
        return 0.0
    now = now or datetime.now(timezone.utc)
    mask = (trades["exit_date"].dt.year == now.year) & (trades["exit_date"].dt.month == now.month)
    return float(trades.loc[mask, "pnl"].sum()) / account_size


def equity_curve(
    account_size: float, spy: Optional[pd.DataFrame] = None, db_path: Optional[str] = None
) -> pd.DataFrame:
    """Cumulative realized equity from closed trades, optionally vs SPY.

    SPY comparison assumes the full account bought SPY on the first trade date.
    """
    trades = closed_trades_frame(db_path)
    if trades.empty:
        return pd.DataFrame(columns=["date", "equity", "spy_equity"])
    trades = trades.sort_values("exit_date")
    curve = pd.DataFrame(
        {"date": trades["exit_date"], "equity": account_size + trades["pnl"].cumsum()}
    )
    if spy is not None and not spy.empty:
        start = curve["date"].iloc[0]
        spy_window = spy[spy.index >= start]
        if not spy_window.empty:
            base = float(spy_window["close"].iloc[0])
            spy_equity = account_size * spy_window["close"] / base
            merged = pd.merge_asof(
                curve.sort_values("date"),
                spy_equity.rename("spy_equity").reset_index(names="date"),
                on="date",
            )
            return merged
    curve["spy_equity"] = np.nan
    return curve
