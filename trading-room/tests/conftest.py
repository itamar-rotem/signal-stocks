"""Shared fixtures: make the trading-room modules importable and provide
synthetic OHLCV data. No network access in any test."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import data  # noqa: E402


@pytest.fixture()
def tmp_db(tmp_path) -> str:
    """Path to a fresh throwaway SQLite database."""
    return str(tmp_path / "test_trading.db")


@pytest.fixture()
def synthetic_ohlcv() -> pd.DataFrame:
    """Deterministic regime-switching OHLCV, ~6 years of daily bars."""
    return data.synthetic_history("TEST", days=1500, seed=42)


@pytest.fixture()
def trending_up() -> pd.DataFrame:
    """A clean, low-noise uptrend: +0.3%/day with mild wiggle."""
    days = 400
    rng = np.random.default_rng(7)
    close = 100.0 * np.cumprod(1 + 0.003 + rng.normal(0, 0.002, days))
    idx = pd.bdate_range("2020-01-01", periods=days)
    return pd.DataFrame(
        {
            "open": close * 0.999,
            "high": close * 1.006,
            "low": close * 0.994,
            "close": close,
            "volume": np.full(days, 5_000_000.0),
        },
        index=idx,
    )


@pytest.fixture()
def trending_down() -> pd.DataFrame:
    """A clean downtrend: -0.3%/day with mild wiggle."""
    days = 400
    rng = np.random.default_rng(8)
    close = 100.0 * np.cumprod(1 - 0.003 + rng.normal(0, 0.002, days))
    idx = pd.bdate_range("2020-01-01", periods=days)
    return pd.DataFrame(
        {
            "open": close * 1.001,
            "high": close * 1.006,
            "low": close * 0.994,
            "close": close,
            "volume": np.full(days, 5_000_000.0),
        },
        index=idx,
    )
