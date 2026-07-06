"""Backtest the hysteresis strategy (enter score>=60, exit<=45) vs buy & hold.

Usage:
    python backtest.py AAPL
    python backtest.py AAPL NVDA --walkforward
    python backtest.py DEMO --synthetic          # offline demo, fake data

Per ticker: 10 years of daily bars, long/flat hysteresis strategy with a
0.05% cost applied on every position change. Reports CAGR, max drawdown,
Sharpe, win rate and trade count for both the strategy and buy & hold, and
warns "no edge on this ticker" when the strategy Sharpe is below buy & hold.

--walkforward fits the enter/exit thresholds on the first 60% of the data
(grid search maximizing Sharpe) and reports performance on the last 40%
only, warning loudly when out-of-sample Sharpe < 50% of in-sample.

Backtests are hypothetical. Past performance does not predict future
results. Not financial advice.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

import signals as sig

TRADING_DAYS_PER_YEAR = 252
COST_PER_CHANGE = 0.0005  # 0.05% of notional per position change

ENTER_GRID = (55.0, 60.0, 65.0, 70.0)
EXIT_GRID = (35.0, 40.0, 45.0, 50.0)


# --------------------------------------------------------------------- metrics

@dataclass
class Metrics:
    cagr: float
    max_drawdown: float
    sharpe: float
    win_rate: float
    trades: int
    total_return: float

    def row(self) -> dict:
        return {
            "CAGR": f"{self.cagr * 100:+.1f}%",
            "MaxDD": f"{self.max_drawdown * 100:.1f}%",
            "Sharpe": f"{self.sharpe:.2f}",
            "Win rate": f"{self.win_rate * 100:.0f}%" if not np.isnan(self.win_rate) else "-",
            "Trades": str(self.trades),
            "Total": f"{self.total_return * 100:+.0f}%",
        }


def sharpe_ratio(returns: pd.Series) -> float:
    r = returns.dropna()
    if len(r) < 2 or r.std() < 1e-12:
        return 0.0
    return float(r.mean() / r.std() * np.sqrt(TRADING_DAYS_PER_YEAR))


def max_drawdown(equity: pd.Series) -> float:
    peak = equity.cummax()
    return float((equity / peak - 1.0).min())


def cagr(equity: pd.Series) -> float:
    if len(equity) < 2 or equity.iloc[0] <= 0:
        return 0.0
    years = len(equity) / TRADING_DAYS_PER_YEAR
    return float((equity.iloc[-1] / equity.iloc[0]) ** (1.0 / years) - 1.0)


def compute_metrics(returns: pd.Series, positions: Optional[pd.Series] = None) -> Metrics:
    """Metrics from a daily-return series; trade stats need the position series."""
    equity = (1.0 + returns.fillna(0.0)).cumprod()
    win_rate = np.nan
    trades = 0
    if positions is not None:
        trade_returns = _trade_returns(returns, positions)
        trades = len(trade_returns)
        if trades:
            win_rate = float((np.array(trade_returns) > 0).mean())
    return Metrics(
        cagr=cagr(equity),
        max_drawdown=max_drawdown(equity),
        sharpe=sharpe_ratio(returns),
        win_rate=win_rate,
        trades=trades,
        total_return=float(equity.iloc[-1] - 1.0),
    )


def _trade_returns(returns: pd.Series, positions: pd.Series) -> list[float]:
    """Compound return of each round-trip (consecutive in-position segment)."""
    out: list[float] = []
    acc = 1.0
    in_trade = False
    for ret, pos in zip(returns.fillna(0.0), positions.fillna(0)):
        if pos == 1:
            acc *= 1.0 + ret
            in_trade = True
        elif in_trade:
            out.append(acc - 1.0)
            acc = 1.0
            in_trade = False
    if in_trade:
        out.append(acc - 1.0)
    return out


# -------------------------------------------------------------------- backtest

@dataclass
class BacktestResult:
    ticker: str
    strategy: Metrics
    buy_hold: Metrics
    enter: float
    exit_: float
    start: pd.Timestamp
    end: pd.Timestamp
    no_edge: bool


def run_backtest(
    df: pd.DataFrame,
    ticker: str = "?",
    enter: float = sig.ENTER_THRESHOLD,
    exit_: float = sig.EXIT_THRESHOLD,
    cost: float = COST_PER_CHANGE,
) -> BacktestResult:
    """Long/flat hysteresis backtest on one OHLCV frame.

    Signals are computed on the close of day t and traded from day t+1
    (position series is shifted by one bar — no lookahead).
    """
    scored = sig.compute_scores(df)
    positions = sig.hysteresis_positions(scored["score"], enter=enter, exit_=exit_)
    daily_ret = scored["close"].pct_change()

    held = positions.shift(1).fillna(0)
    changes = positions.diff().abs().fillna(0)
    strat_ret = held * daily_ret - changes * cost

    # Restrict both legs to the scoreable window so the comparison is fair.
    valid = scored["score"].notna()
    strat_ret = strat_ret[valid]
    bh_ret = daily_ret[valid]
    held = held[valid]

    strategy = compute_metrics(strat_ret, held)
    buy_hold = compute_metrics(bh_ret)
    return BacktestResult(
        ticker=ticker,
        strategy=strategy,
        buy_hold=buy_hold,
        enter=enter,
        exit_=exit_,
        start=strat_ret.index[0],
        end=strat_ret.index[-1],
        no_edge=strategy.sharpe < buy_hold.sharpe,
    )


# ------------------------------------------------------------------ walkforward

@dataclass
class WalkforwardResult:
    ticker: str
    best_enter: float
    best_exit: float
    in_sample: Metrics
    out_of_sample: Metrics
    buy_hold_oos: Metrics
    overfit_warning: bool


def run_walkforward(
    df: pd.DataFrame, ticker: str = "?", train_frac: float = 0.6, cost: float = COST_PER_CHANGE
) -> WalkforwardResult:
    """Fit enter/exit thresholds on the first 60%; report the last 40% only.

    Scores are computed once over the full history (indicator values at time t
    only use data up to t), then thresholds are chosen on the training window
    and applied to the untouched test window.
    """
    scored = sig.compute_scores(df)
    daily_ret = scored["close"].pct_change()
    split = int(len(scored) * train_frac)

    def segment_metrics(enter: float, exit_: float, lo: int, hi: int) -> Metrics:
        window_scores = scored["score"].iloc[lo:hi]
        positions = sig.hysteresis_positions(window_scores, enter=enter, exit_=exit_)
        rets = daily_ret.iloc[lo:hi]
        held = positions.shift(1).fillna(0)
        changes = positions.diff().abs().fillna(0)
        strat = held * rets - changes * cost
        valid = window_scores.notna()
        return compute_metrics(strat[valid], held[valid])

    best = (sig.ENTER_THRESHOLD, sig.EXIT_THRESHOLD)
    best_sharpe = -np.inf
    for enter in ENTER_GRID:
        for exit_ in EXIT_GRID:
            if exit_ >= enter:
                continue
            m = segment_metrics(enter, exit_, 0, split)
            if m.sharpe > best_sharpe:
                best_sharpe = m.sharpe
                best = (enter, exit_)

    in_sample = segment_metrics(best[0], best[1], 0, split)
    out_of_sample = segment_metrics(best[0], best[1], split, len(scored))
    oos_valid = scored["score"].iloc[split:].notna()
    buy_hold_oos = compute_metrics(daily_ret.iloc[split:][oos_valid])

    overfit = (
        in_sample.sharpe > 0 and out_of_sample.sharpe < 0.5 * in_sample.sharpe
    )
    return WalkforwardResult(
        ticker=ticker,
        best_enter=best[0],
        best_exit=best[1],
        in_sample=in_sample,
        out_of_sample=out_of_sample,
        buy_hold_oos=buy_hold_oos,
        overfit_warning=overfit,
    )


# ------------------------------------------------------------------- reporting

def _print_table(rows: dict[str, Metrics]) -> None:
    frame = pd.DataFrame({name: m.row() for name, m in rows.items()}).T
    print(frame.to_string())


def report(result: BacktestResult) -> None:
    print(f"\n=== {result.ticker} | {result.start:%Y-%m-%d} → {result.end:%Y-%m-%d} "
          f"| enter>={result.enter:.0f} exit<={result.exit_:.0f} "
          f"| cost {COST_PER_CHANGE * 100:.2f}%/change ===")
    _print_table({"Strategy": result.strategy, "Buy & hold": result.buy_hold})
    if result.no_edge:
        print(f"⚠ NO EDGE on this ticker: strategy Sharpe ({result.strategy.sharpe:.2f}) "
              f"< buy & hold Sharpe ({result.buy_hold.sharpe:.2f}).")


def report_walkforward(result: WalkforwardResult) -> None:
    print(f"\n--- {result.ticker} walk-forward: thresholds fit on first 60% "
          f"(best enter>={result.best_enter:.0f}, exit<={result.best_exit:.0f}), "
          f"reporting last 40% only ---")
    _print_table({
        "In-sample (60%)": result.in_sample,
        "Out-of-sample (40%)": result.out_of_sample,
        "Buy & hold (40%)": result.buy_hold_oos,
    })
    if result.overfit_warning:
        print("🚨🚨 OVERFITTING WARNING 🚨🚨")
        print(f"Out-of-sample Sharpe ({result.out_of_sample.sharpe:.2f}) is less than half "
              f"of in-sample ({result.in_sample.sharpe:.2f}). The fitted thresholds do NOT "
              f"generalize — treat this strategy as having no demonstrated edge here.")


def main() -> None:  # pragma: no cover
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tickers", nargs="+", help="tickers to backtest")
    parser.add_argument("--period", default="10y", help="yfinance period (default 10y)")
    parser.add_argument("--walkforward", action="store_true",
                        help="fit thresholds on first 60%%, report last 40%% only")
    parser.add_argument("--enter", type=float, default=sig.ENTER_THRESHOLD)
    parser.add_argument("--exit", dest="exit_", type=float, default=sig.EXIT_THRESHOLD)
    parser.add_argument("--synthetic", action="store_true",
                        help="use deterministic SYNTHETIC data (offline demo — not real prices)")
    args = parser.parse_args()

    import data

    for ticker in args.tickers:
        ticker = ticker.upper()
        if args.synthetic:
            print(f"\n[!] SYNTHETIC DATA MODE for {ticker} — random-walk demo, not real prices.")
            df = data.synthetic_history(ticker, days=2520)
        else:
            df = data.get_history(ticker, period=args.period)
        if df.empty or len(df) < 260:
            print(f"\n{ticker}: not enough data ({len(df)} bars) — skipping.")
            continue
        report(run_backtest(df, ticker, enter=args.enter, exit_=args.exit_))
        if args.walkforward:
            report_walkforward(run_walkforward(df, ticker))

    print("\nBacktests are hypothetical; past performance does not predict future results.")
    print("Not financial advice.")


if __name__ == "__main__":
    main()
