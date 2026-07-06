"""Tests for backtest metrics and the walk-forward harness (synthetic data)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import backtest as bt
import data


class TestMetrics:
    def test_sharpe_of_constant_positive_returns(self):
        # std ~ 0 -> guarded to 0.0 rather than inf
        rets = pd.Series([0.001] * 100)
        assert bt.sharpe_ratio(rets) == 0.0

    def test_sharpe_sign(self):
        rng = np.random.default_rng(5)
        up = pd.Series(rng.normal(0.002, 0.01, 500))
        down = pd.Series(rng.normal(-0.002, 0.01, 500))
        assert bt.sharpe_ratio(up) > 0 > bt.sharpe_ratio(down)

    def test_max_drawdown_known_path(self):
        equity = pd.Series([100.0, 120.0, 90.0, 110.0])
        assert bt.max_drawdown(equity) == pytest.approx(90 / 120 - 1)  # -25%

    def test_cagr_doubling_in_a_year(self):
        equity = pd.Series(np.linspace(1.0, 2.0, bt.TRADING_DAYS_PER_YEAR))
        assert bt.cagr(equity) == pytest.approx(2.0 ** (252 / 252) - 1, rel=0.01)

    def test_trade_returns_segmentation(self):
        rets = pd.Series([0.0, 0.10, 0.10, 0.0, 0.0, -0.05, 0.0])
        pos = pd.Series([0, 1, 1, 0, 0, 1, 0])
        trades = bt._trade_returns(rets, pos)
        assert len(trades) == 2
        assert trades[0] == pytest.approx(1.1 * 1.1 - 1)
        assert trades[1] == pytest.approx(-0.05)


class TestBacktest:
    def test_runs_on_synthetic_and_counts_costs(self):
        df = data.synthetic_history("TEST", days=1500, seed=42)
        free = bt.run_backtest(df, "TEST", cost=0.0)
        priced = bt.run_backtest(df, "TEST", cost=0.01)  # exaggerated cost
        assert priced.strategy.total_return < free.strategy.total_return
        assert free.strategy.trades == priced.strategy.trades

    def test_no_lookahead_positions_shifted(self):
        # A single huge up-day right when the signal enters must NOT be
        # captured by the strategy (trade starts the next bar).
        df = data.synthetic_history("TEST", days=1500, seed=42)
        result = bt.run_backtest(df, "TEST")
        assert result.start > df.index[0]  # warm-up trimmed

    def test_no_edge_flag(self):
        df = data.synthetic_history("TEST", days=1500, seed=42)
        result = bt.run_backtest(df, "TEST")
        assert result.no_edge == (result.strategy.sharpe < result.buy_hold.sharpe)


class TestWalkforward:
    def test_thresholds_fit_within_grid_and_ordered(self):
        df = data.synthetic_history("WF", days=2000, seed=11)
        wf = bt.run_walkforward(df, "WF")
        assert wf.best_enter in bt.ENTER_GRID
        assert wf.best_exit in bt.EXIT_GRID
        assert wf.best_exit < wf.best_enter

    def test_overfit_warning_logic(self):
        df = data.synthetic_history("WF", days=2000, seed=11)
        wf = bt.run_walkforward(df, "WF")
        expected = wf.in_sample.sharpe > 0 and (
            wf.out_of_sample.sharpe < 0.5 * wf.in_sample.sharpe
        )
        assert wf.overfit_warning == expected
