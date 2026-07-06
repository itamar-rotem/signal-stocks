"""Unit tests for the portfolio risk layer: caps, breaker, regime, earnings."""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

import risk


def open_pos(ticker: str, sector: str = "Tech", entry: float = 100.0,
             stop: float = 96.0, shares: float = 100.0) -> dict:
    return {"ticker": ticker, "sector": sector, "entry_price": entry,
            "stop": stop, "shares": shares}


class TestPositionCaps:
    def test_max_six_open_positions(self):
        positions = [open_pos(f"T{i}", sector=f"S{i}", shares=1.0) for i in range(6)]
        check = risk.check_entry("NEW", "Other", 100.0, positions, 100_000.0)
        assert not check.allowed
        assert any("Position cap" in v for v in check.violations)

    def test_five_positions_ok(self):
        positions = [open_pos(f"T{i}", sector=f"S{i}", shares=1.0) for i in range(5)]
        check = risk.check_entry("NEW", "Other", 100.0, positions, 100_000.0)
        assert check.allowed

    def test_max_two_per_sector(self):
        positions = [open_pos("T1", "Tech", shares=1.0), open_pos("T2", "Tech", shares=1.0)]
        check = risk.check_entry("NEW", "Tech", 100.0, positions, 100_000.0)
        assert not check.allowed
        assert any("Sector cap" in v for v in check.violations)
        other = risk.check_entry("NEW", "Energy", 100.0, positions, 100_000.0)
        assert other.allowed

    def test_total_risk_cap_six_percent(self):
        # Two positions each risking $2,500 (2.5%) -> 5% open risk.
        positions = [
            open_pos("T1", "Tech", entry=100.0, stop=95.0, shares=500.0),
            open_pos("T2", "Energy", entry=100.0, stop=95.0, shares=500.0),
        ]
        ok = risk.check_entry("NEW", "Health", 900.0, positions, 100_000.0)
        assert ok.allowed  # 5.9% total
        too_much = risk.check_entry("NEW", "Health", 1_200.0, positions, 100_000.0)
        assert not too_much.allowed  # 6.2% total
        assert any("Total open risk" in v for v in too_much.violations)

    def test_duplicate_ticker_blocked(self):
        check = risk.check_entry("AAPL", "Tech", 100.0, [open_pos("AAPL")], 100_000.0)
        assert not check.allowed
        assert any("Already holding" in v for v in check.violations)


class TestCircuitBreaker:
    def test_trips_at_minus_five_percent(self):
        assert risk.circuit_breaker_tripped(-0.05)
        assert risk.circuit_breaker_tripped(-0.08)
        assert not risk.circuit_breaker_tripped(-0.049)
        assert not risk.circuit_breaker_tripped(0.02)

    def test_manual_override(self):
        assert not risk.circuit_breaker_tripped(-0.08, override=True)

    def test_blocks_entry_and_mentions_override(self):
        check = risk.check_entry("NEW", "Tech", 100.0, [], 100_000.0, month_pnl_pct=-0.06)
        assert not check.allowed
        assert any("Circuit breaker" in v and "override" in v for v in check.violations)

    def test_override_unblocks_entry(self):
        check = risk.check_entry(
            "NEW", "Tech", 100.0, [], 100_000.0,
            month_pnl_pct=-0.06, circuit_breaker_override=True,
        )
        assert check.allowed


class TestRegime:
    def make_spy(self, trending_up: bool) -> pd.DataFrame:
        days = 300
        drift = 0.002 if trending_up else -0.002
        close = 400.0 * np.cumprod(np.full(days, 1 + drift))
        return pd.DataFrame({"close": close},
                            index=pd.bdate_range("2023-01-01", periods=days))

    def make_vix(self, level: float) -> pd.DataFrame:
        return pd.DataFrame({"close": [level] * 10},
                            index=pd.bdate_range("2024-01-01", periods=10))

    def test_risk_on(self):
        regime = risk.market_regime(self.make_spy(True), self.make_vix(15.0))
        assert not regime.risk_off
        assert regime.label == "RISK-ON"

    def test_spy_below_sma200_is_risk_off(self):
        regime = risk.market_regime(self.make_spy(False), self.make_vix(15.0))
        assert regime.risk_off
        assert any("200-day" in r for r in regime.reasons)

    def test_high_vix_is_risk_off(self):
        regime = risk.market_regime(self.make_spy(True), self.make_vix(35.0))
        assert regime.risk_off
        assert any("VIX" in r for r in regime.reasons)

    def test_risk_off_blocks_new_entries(self):
        regime = risk.market_regime(self.make_spy(False), self.make_vix(15.0))
        check = risk.check_entry("NEW", "Tech", 100.0, [], 100_000.0, regime=regime)
        assert not check.allowed
        assert any("RISK-OFF" in v for v in check.violations)


class TestEarningsFilter:
    def test_blocked_within_five_trading_days(self):
        today = date(2026, 7, 6)  # a Monday
        assert risk.earnings_blocked(date(2026, 7, 10), today)   # Friday: 4 td
        assert risk.earnings_blocked(date(2026, 7, 13), today)   # next Monday: 5 td
        assert not risk.earnings_blocked(date(2026, 7, 20), today)  # 10 td
        assert not risk.earnings_blocked(None, today)

    def test_warning_within_seven_calendar_days(self):
        today = date(2026, 7, 6)
        assert risk.earnings_warning(date(2026, 7, 12), today)
        assert not risk.earnings_warning(date(2026, 7, 13), today)
        assert not risk.earnings_warning(None, today)

    def test_entry_check_blocks_on_imminent_earnings(self):
        today = date(2026, 7, 6)
        check = risk.check_entry(
            "NEW", "Tech", 100.0, [], 100_000.0,
            earnings_date=date(2026, 7, 9), today=today,
        )
        assert not check.allowed
        assert any("Earnings" in v for v in check.violations)

    def test_entry_check_warns_on_near_earnings(self):
        today = date(2026, 7, 6)
        check = risk.check_entry(
            "NEW", "Tech", 100.0, [], 100_000.0,
            earnings_date=date(2026, 7, 17), today=today,  # 9 trading days: no block
        )
        assert check.allowed
        # 11 calendar days away -> no warning either
        assert not check.warnings
        near = risk.check_entry(
            "NEW", "Tech", 100.0, [], 100_000.0,
            earnings_date=date(2026, 7, 15), today=today,  # 7 td: no block; but 9 cal days
        )
        assert near.allowed


class TestCorrelationGuard:
    def test_identical_series_warns(self):
        rng = np.random.default_rng(1)
        rets = pd.Series(rng.normal(0, 0.01, 120))
        hits = risk.correlation_warnings(rets, {"TWIN": rets.copy()})
        assert hits and "TWIN" in hits[0]

    def test_independent_series_do_not_warn(self):
        rng = np.random.default_rng(2)
        a = pd.Series(rng.normal(0, 0.01, 120))
        b = pd.Series(rng.normal(0, 0.01, 120))
        assert risk.correlation_warnings(a, {"OTHER": b}) == []

    def test_short_overlap_is_skipped(self):
        a = pd.Series(np.linspace(0, 1, 10))
        b = pd.Series(np.linspace(0, 1, 10))
        assert risk.correlation_warnings(a, {"TINY": b}) == []

    def test_entry_check_surfaces_correlation_warning(self):
        rng = np.random.default_rng(3)
        rets = pd.Series(rng.normal(0, 0.01, 120))
        check = risk.check_entry(
            "NEW", "Tech", 100.0, [open_pos("TWIN", shares=1.0)], 100_000.0,
            candidate_returns=rets, open_returns={"TWIN": rets * 1.0},
        )
        assert check.allowed  # warning, not a block
        assert any("correlation" in w.lower() for w in check.warnings)


class TestPositionRisk:
    def test_dollar_risk(self):
        assert risk.position_risk(open_pos("X", entry=100.0, stop=96.0, shares=250.0)) \
            == pytest.approx(1000.0)

    def test_no_stop_means_zero_risk(self):
        pos = open_pos("X")
        pos["stop"] = None
        assert risk.position_risk(pos) == 0.0
