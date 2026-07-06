"""Unit tests for screener ranking, filters, sector-neutral mode and movers."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import screener


def make_features(**col_overrides) -> pd.DataFrame:
    """Five-ticker synthetic feature frame with monotone rankings.

    Percentiles with rank(pct=True) over 5 rows are 0.2/0.4/0.6/0.8/1.0.
    """
    base = {
        "sector": ["Tech", "Tech", "Energy", "Health", "Finance"],
        "price": [10.0, 20.0, 50.0, 100.0, 200.0],
        "score": [20.0, 40.0, 55.0, 70.0, 90.0],
        "signal": ["SELL", "HOLD", "HOLD", "BUY", "BUY"],
        "rsi14": [40.0, 45.0, 50.0, 55.0, 60.0],
        "atr14": [1.0, 1.0, 2.0, 3.0, 5.0],
        "above_sma200": [True, True, True, True, True],
        "ret_6m": [-0.2, -0.1, 0.05, 0.15, 0.40],
        "ret_3m": [-0.1, -0.05, 0.02, 0.08, 0.20],
        "rel_ret_3m": [-0.12, -0.07, 0.0, 0.06, 0.18],
        "pct_52w_high": [0.55, 0.65, 0.80, 0.90, 0.99],
        "adv20_dollar": [50e6, 60e6, 70e6, 80e6, 90e6],
        "rel_volume": [1.0, 1.0, 1.0, 1.0, 1.0],
        "gap": [0.0, 0.0, 0.0, 0.0, 0.0],
        "vol_dampened": [False] * 5,
    }
    base.update(col_overrides)
    frame = pd.DataFrame(base, index=["AAA", "BBB", "CCC", "DDD", "EEE"])
    frame.index.name = "ticker"
    return frame


class TestLiquidityFilters:
    def test_price_and_dollar_volume_filters(self):
        features = make_features(
            price=[4.0, 20.0, 50.0, 100.0, 200.0],       # AAA fails price > $5
            adv20_dollar=[50e6, 10e6, 70e6, 80e6, 90e6],  # BBB fails $20M ADV
        )
        out = screener.apply_liquidity_filters(features)
        assert list(out.index) == ["CCC", "DDD", "EEE"]


class TestRanking:
    def test_long_rank_formula_exact(self):
        ranked = screener.rank_universe(make_features())
        # Every input column is monotone increasing, so every pctile for EEE
        # is 1.0 and for AAA is 0.2 -> weighted sums are exact.
        assert ranked.loc["EEE", "long_rank"] == pytest.approx(
            0.35 * 1.0 + 0.25 * 1.0 + 0.20 * 1.0 + 0.20 * 1.0
        )
        assert ranked.loc["AAA", "long_rank"] == pytest.approx(
            0.35 * 0.2 + 0.25 * 0.2 + 0.20 * 0.2 + 0.20 * 0.2
        )

    def test_short_rank_is_complement_of_base(self):
        ranked = screener.rank_universe(make_features())
        # No penalties in the default fixture (all above SMA200, RSI mid-zone):
        # short penalty applies to shorts above SMA200 -> all rows get -0.25.
        assert ranked.loc["AAA", "short_rank"] == pytest.approx(
            (1.0 - ranked.loc["AAA", "base_long_rank"]) - 0.25
        )

    def test_long_penalty_below_sma200(self):
        plain = screener.rank_universe(make_features())
        penalized = screener.rank_universe(
            make_features(above_sma200=[True, True, True, True, False])
        )
        assert penalized.loc["EEE", "long_rank"] == pytest.approx(
            plain.loc["EEE", "long_rank"] - 0.25
        )

    def test_long_penalty_overbought_rsi(self):
        plain = screener.rank_universe(make_features())
        penalized = screener.rank_universe(
            make_features(rsi14=[40.0, 45.0, 50.0, 55.0, 80.0])
        )
        assert penalized.loc["EEE", "long_rank"] == pytest.approx(
            plain.loc["EEE", "long_rank"] - 0.25
        )

    def test_short_penalty_oversold_rsi_below_sma200(self):
        # Below SMA200 removes the above-SMA short penalty; RSI < 25 adds it back.
        ranked = screener.rank_universe(
            make_features(
                above_sma200=[False, False, False, False, False],
                rsi14=[20.0, 45.0, 50.0, 55.0, 60.0],
            )
        )
        base_aaa = ranked.loc["AAA", "base_long_rank"]
        base_bbb = ranked.loc["BBB", "base_long_rank"]
        assert ranked.loc["AAA", "short_rank"] == pytest.approx((1 - base_aaa) - 0.25)
        assert ranked.loc["BBB", "short_rank"] == pytest.approx(1 - base_bbb)


class TestSectorNeutral:
    def test_max_two_per_sector(self):
        features = make_features(
            sector=["Tech", "Tech", "Tech", "Tech", "Energy"],
        )
        ranked = screener.rank_universe(features)
        picks = screener.sector_neutral_picks(ranked, "long_rank", top_n=4)
        assert (picks["sector"] == "Tech").sum() <= 2
        # Highest-ranked tickers (EEE Energy, DDD+CCC Tech) make the cut;
        # the third-best Tech name is skipped.
        assert "BBB" not in picks.index

    def test_without_cap_takes_pure_top_n(self):
        ranked = screener.rank_universe(make_features())
        top = ranked.sort_values("long_rank", ascending=False).head(3)
        assert list(top.index) == ["EEE", "DDD", "CCC"]


class TestMovers:
    def test_relative_volume_flag(self):
        features = make_features(rel_volume=[1.0, 3.5, 1.0, 1.0, 1.0])
        movers = screener.find_movers(features)
        assert list(movers.index) == ["BBB"]
        assert "volume 3.5x" in movers.loc["BBB", "mover_reason"]

    def test_gap_flag_both_directions(self):
        features = make_features(gap=[0.05, 0.0, -0.045, 0.0, 0.01])
        movers = screener.find_movers(features)
        assert set(movers.index) == {"AAA", "CCC"}
        assert "gapped up 5.0%" in movers.loc["AAA", "mover_reason"]
        assert "gapped down 4.5%" in movers.loc["CCC", "mover_reason"]

    def test_no_movers(self):
        movers = screener.find_movers(make_features())
        assert movers.empty


class TestReasons:
    def test_long_reason_mentions_key_facts(self):
        ranked = screener.rank_universe(make_features())
        text = screener.long_reason(ranked.loc["EEE"])
        assert "score 90" in text
        assert "200-day" in text
        assert "+40%" in text

    def test_end_to_end_run_screener_on_synthetic(self, synthetic_ohlcv):
        # Build a small universe from shifted copies of the synthetic frame.
        import data as data_mod
        universe = {
            t: data_mod.synthetic_history(t, days=600, seed=i)
            for i, t in enumerate(["AAA", "BBB", "CCC", "DDD"])
        }
        spy = data_mod.synthetic_history("SPY", days=600, seed=99)
        result = screener.run_screener(
            universe, spy, sectors={"AAA": "Tech", "BBB": "Tech",
                                    "CCC": "Energy", "DDD": "Health"},
            top_n=3,
        )
        assert not result.table.empty
        assert "reason" in result.longs.columns
        assert result.longs["reason"].str.len().gt(20).all()
