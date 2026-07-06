"""Unit tests for indicator math and the composite score recipe."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import signals as sig


# ------------------------------------------------------------------ indicators

class TestIndicators:
    def test_sma_matches_manual_mean(self):
        s = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
        out = sig.sma(s, 3)
        assert np.isnan(out.iloc[1])
        assert out.iloc[2] == pytest.approx(2.0)
        assert out.iloc[4] == pytest.approx(4.0)

    def test_rsi_extremes(self):
        rising = pd.Series(np.linspace(100, 200, 60))
        falling = pd.Series(np.linspace(200, 100, 60))
        assert sig.rsi(rising).iloc[-1] == pytest.approx(100.0)
        assert sig.rsi(falling).iloc[-1] == pytest.approx(0.0, abs=1e-9)

    def test_rsi_flat_is_neutral(self):
        flat = pd.Series(np.full(60, 100.0))
        assert sig.rsi(flat).iloc[-1] == pytest.approx(50.0)

    def test_rsi_bounded(self, synthetic_ohlcv):
        out = sig.rsi(synthetic_ohlcv["close"]).dropna()
        assert ((out >= 0) & (out <= 100)).all()

    def test_macd_histogram_sign_on_trend_onset(self):
        # Histogram is positive while momentum is building (fresh breakout
        # after a flat base) and negative while it is breaking down.
        flat = np.full(100, 100.0)
        breakout = pd.Series(np.concatenate([flat, np.linspace(100, 150, 50)]))
        breakdown = pd.Series(np.concatenate([flat, np.linspace(100, 60, 50)]))
        _, _, hist_up = sig.macd(breakout)
        _, _, hist_down = sig.macd(breakdown)
        assert hist_up.iloc[-1] > 0
        assert hist_down.iloc[-1] < 0

    def test_atr_on_constant_range_bars(self):
        # H-L = 2 every day, close in the middle, no gaps -> ATR converges to 2.
        days = 200
        close = np.full(days, 100.0)
        df_high = pd.Series(close + 1.0)
        df_low = pd.Series(close - 1.0)
        out = sig.atr(df_high, df_low, pd.Series(close), 14)
        assert out.iloc[-1] == pytest.approx(2.0, rel=1e-6)

    def test_atr_positive(self, synthetic_ohlcv):
        out = sig.atr(
            synthetic_ohlcv["high"], synthetic_ohlcv["low"], synthetic_ohlcv["close"]
        ).dropna()
        assert (out > 0).all()

    def test_adx_bounded_and_high_in_strong_trend(self, trending_up, synthetic_ohlcv):
        strong = sig.adx(trending_up["high"], trending_up["low"], trending_up["close"])
        assert strong.iloc[-1] > 25  # persistent one-way trend
        any_ = sig.adx(
            synthetic_ohlcv["high"], synthetic_ohlcv["low"], synthetic_ohlcv["close"]
        ).dropna()
        assert ((any_ >= 0) & (any_ <= 100)).all()

    def test_obv_accumulates_volume_with_up_days(self):
        close = pd.Series([10.0, 11.0, 12.0, 13.0])
        volume = pd.Series([100.0, 200.0, 300.0, 400.0])
        out = sig.obv(close, volume)
        # First diff is 0-direction, then all up days: 0 +200 +300 +400.
        assert out.iloc[-1] == pytest.approx(900.0)

    def test_obv_subtracts_on_down_days(self):
        close = pd.Series([10.0, 9.0, 8.0])
        volume = pd.Series([100.0, 200.0, 300.0])
        assert sig.obv(close, volume).iloc[-1] == pytest.approx(-500.0)


# --------------------------------------------------------------- score recipe

def make_indicator_row(**overrides) -> pd.DataFrame:
    """A single indicator row with bullish-neutral defaults, spec-exact inputs."""
    base = {
        "close": 110.0,
        "sma50": 105.0,
        "sma200": 100.0,
        "rsi14": 60.0,
        "macd_hist": 1.0,
        "adx14": 32.0,
        "atr14": 2.0,
        "atr_pct": 2.0 / 110.0,
        "obv_chg20": 1000.0,
    }
    base.update(overrides)
    return pd.DataFrame([base])


class TestScoreRecipe:
    def test_bullish_case_exact_components(self):
        comp = sig.score_components(make_indicator_row())
        row = comp.iloc[0]
        assert row["c_trend_sma200"] == 10.0          # close 110 > sma200 100
        assert row["c_trend_cross"] == 8.0            # sma50 105 > sma200 100
        # direction +1, (32-20)/20 = 0.6 -> 0.6 * 12 = 7.2
        assert row["c_trend_adx"] == pytest.approx(7.2)
        assert row["c_mom_macd"] == 8.0               # hist > 0
        assert row["c_mom_rsi"] == 9.0                # rsi 60 in [50, 70)
        assert row["c_meanrev"] == 0.0                # stretch 4.76% within band
        assert row["c_volume_obv"] == 7.0             # obv 20d change > 0
        assert row["raw_score"] == pytest.approx(50 + 10 + 8 + 7.2 + 8 + 9 + 0 + 7)
        assert row["score"] == pytest.approx(99.2)    # no vol dampening (short history)

    def test_bearish_case_exact_components(self):
        comp = sig.score_components(
            make_indicator_row(
                close=90.0, sma50=95.0, sma200=100.0, rsi14=25.0,
                macd_hist=-1.0, adx14=40.0, obv_chg20=-500.0,
            )
        )
        row = comp.iloc[0]
        assert row["c_trend_sma200"] == -10.0
        assert row["c_trend_cross"] == -8.0
        assert row["c_trend_adx"] == pytest.approx(-12.0)  # direction -1, full strength
        assert row["c_mom_macd"] == -8.0
        assert row["c_mom_rsi"] == -2.0                    # rsi <= 30
        assert row["c_meanrev"] == 0.0                     # -5.3% within band
        assert row["c_volume_obv"] == -7.0
        assert row["score"] == pytest.approx(50 - 10 - 8 - 12 - 8 - 2 + 0 - 7)  # 3.0

    @pytest.mark.parametrize(
        "rsi_value,expected",
        [(75.0, 2.0), (70.0, 2.0), (69.9, 9.0), (50.0, 9.0),
         (49.9, -5.0), (30.1, -5.0), (30.0, -2.0), (20.0, -2.0)],
    )
    def test_rsi_zones(self, rsi_value, expected):
        comp = sig.score_components(make_indicator_row(rsi14=rsi_value))
        assert comp.iloc[0]["c_mom_rsi"] == expected

    def test_adx_strength_clipped_to_unit_range(self):
        weak = sig.score_components(make_indicator_row(adx14=15.0))
        maxed = sig.score_components(make_indicator_row(adx14=60.0))
        assert weak.iloc[0]["c_trend_adx"] == 0.0      # (15-20)/20 clipped to 0
        assert maxed.iloc[0]["c_trend_adx"] == 12.0    # clipped to 1 -> full 12

    def test_mean_reversion_bands(self):
        stretched = sig.score_components(
            make_indicator_row(close=113.0, sma50=100.0)  # +13% > 12%
        )
        washed_out = sig.score_components(
            make_indicator_row(close=87.0, sma50=100.0)   # -13% < -12%
        )
        assert stretched.iloc[0]["c_meanrev"] == -10.0
        assert washed_out.iloc[0]["c_meanrev"] == 6.0

    def test_volatility_regime_halves_conviction(self):
        # 300 identical bullish rows with tiny atr_pct, then a huge-ATR row:
        # the last row lands in the top 15% of trailing 252 and gets dampened.
        rows = pd.concat([make_indicator_row(atr_pct=0.01)] * 300 +
                         [make_indicator_row(atr_pct=0.50)], ignore_index=True)
        comp = sig.score_components(rows)
        calm, wild = comp.iloc[0], comp.iloc[-1]
        assert not calm["vol_dampened"]
        assert wild["vol_dampened"]
        assert calm["score"] == pytest.approx(99.2)
        assert wild["score"] == pytest.approx(50 + (99.2 - 50) * 0.5)  # 74.6

    def test_warmup_rows_have_nan_score(self, synthetic_ohlcv):
        scored = sig.compute_scores(synthetic_ohlcv)
        assert np.isnan(scored["score"].iloc[100])  # before SMA200 exists
        assert not np.isnan(scored["score"].iloc[-1])

    def test_score_bounds(self, synthetic_ohlcv):
        scored = sig.compute_scores(synthetic_ohlcv)
        valid = scored["score"].dropna()
        assert ((valid >= 0) & (valid <= 100)).all()

    def test_uptrend_scores_high_downtrend_low(self, trending_up, trending_down):
        up = sig.compute_scores(trending_up)["score"].iloc[-1]
        down = sig.compute_scores(trending_down)["score"].iloc[-1]
        assert up >= 65
        assert down <= 35


# ------------------------------------------------------------- classification

class TestClassify:
    def test_thresholds(self):
        assert sig.classify(65.0) == "BUY"
        assert sig.classify(64.9) == "HOLD"
        assert sig.classify(35.0) == "SELL"
        assert sig.classify(35.1) == "HOLD"

    def test_series_form(self):
        out = sig.classify(pd.Series([70.0, 50.0, 30.0, np.nan]))
        assert list(out[:3]) == ["BUY", "HOLD", "SELL"]
        assert out.iloc[3] is None


class TestHysteresis:
    def test_enter_exit_state_machine(self):
        scores = pd.Series([50, 61, 64, 50, 46, 44, 62, 45], dtype=float)
        pos = sig.hysteresis_positions(scores)
        # enters at 61, holds through 50 and 46 (>45), exits at 44,
        # re-enters at 62, exits at 45 (<=45).
        assert list(pos) == [0, 1, 1, 1, 1, 0, 1, 0]

    def test_nan_warmup_stays_flat(self):
        scores = pd.Series([np.nan, np.nan, 70.0, np.nan, 40.0])
        pos = sig.hysteresis_positions(scores)
        assert list(pos) == [0, 0, 1, 1, 0]  # NaN keeps prior state


# ------------------------------------------------------------------ trade plan

class TestTradePlan:
    def test_spec_math(self):
        plan = sig.trade_plan(entry=100.0, atr14=2.0, account_size=100_000.0, risk_pct=0.01)
        assert plan.stop == pytest.approx(96.0)    # entry - 2*ATR
        assert plan.target == pytest.approx(106.0)  # entry + 3*ATR
        assert plan.risk_per_share == pytest.approx(4.0)
        assert plan.shares == 250                   # (100k * 1%) / 4
        assert plan.risk_amount == pytest.approx(1000.0)

    def test_shares_floor_not_round(self):
        plan = sig.trade_plan(entry=100.0, atr14=1.5, account_size=10_000.0, risk_pct=0.01)
        # 100 / 3.0 = 33.33 -> 33 shares
        assert plan.shares == 33

    def test_invalid_inputs_return_none(self):
        assert sig.trade_plan(0.0, 2.0, 100_000.0, 0.01) is None
        assert sig.trade_plan(100.0, 0.0, 100_000.0, 0.01) is None
        assert sig.trade_plan(100.0, float("nan"), 100_000.0, 0.01) is None
