"""Tests for the SQLite layer and journal stats using a temp database."""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pytest

import db
import journal


class TestSignalState:
    def test_roundtrip_and_upsert(self, tmp_db):
        assert db.get_signal_state("AAPL", db_path=tmp_db) is None
        db.set_signal_state("AAPL", "BUY", 72.0, 150.0, db_path=tmp_db)
        state = db.get_signal_state("AAPL", db_path=tmp_db)
        assert state["signal"] == "BUY" and state["score"] == 72.0
        db.set_signal_state("AAPL", "HOLD", 55.0, 149.0, db_path=tmp_db)
        assert db.get_signal_state("AAPL", db_path=tmp_db)["signal"] == "HOLD"

    def test_history_unique_per_day(self, tmp_db):
        db.record_signal_history("AAPL", "2026-07-01", "BUY", 70.0, db_path=tmp_db)
        db.record_signal_history("AAPL", "2026-07-01", "HOLD", 55.0, db_path=tmp_db)
        history = db.get_signal_history("AAPL", db_path=tmp_db)
        assert len(history) == 1
        assert history[0]["signal"] == "HOLD"  # upserted


class TestWatchlist:
    def test_add_remove_and_default_seed(self, tmp_db):
        assert db.get_watchlist(db_path=tmp_db) == []
        seeded = db.ensure_default_watchlist(db_path=tmp_db)
        assert "AAPL" in seeded
        db.add_to_watchlist("zm", db_path=tmp_db)  # normalized to upper
        assert "ZM" in db.get_watchlist(db_path=tmp_db)
        db.remove_from_watchlist("ZM", db_path=tmp_db)
        assert "ZM" not in db.get_watchlist(db_path=tmp_db)


class TestPositionsAndJournal:
    def test_entry_exit_roundtrip(self, tmp_db):
        pid = journal.log_entry("AAPL", 100.0, 250, stop=96.0, target=106.0,
                                score=70.0, sector="Tech", db_path=tmp_db)
        assert len(db.get_open_positions(db_path=tmp_db)) == 1
        journal.log_exit(pid, 108.0, reason="target hit", db_path=tmp_db)
        assert db.get_open_positions(db_path=tmp_db) == []
        closed = db.get_closed_positions(db_path=tmp_db)
        assert len(closed) == 1 and closed[0]["exit_price"] == 108.0
        events = [e["event"] for e in db.get_journal(db_path=tmp_db)]
        assert "entry" in events and "exit" in events

    def test_exit_unknown_position_raises(self, tmp_db):
        with pytest.raises(ValueError):
            journal.log_exit(999, 100.0, db_path=tmp_db)

    def test_skip_is_journaled(self, tmp_db):
        journal.log_skip("NVDA", "earnings too close", score=68.0, db_path=tmp_db)
        events = db.get_journal(db_path=tmp_db)
        assert events[0]["event"] == "skip" and events[0]["ticker"] == "NVDA"


class TestStats:
    def seed_trades(self, tmp_db):
        """Two winners (+2R, +1R) and one loser (-1R), $4 risk/share each."""
        trades = [
            ("W1", 100.0, 108.0),  # +2R
            ("W2", 100.0, 104.0),  # +1R
            ("L1", 100.0, 96.0),   # -1R
        ]
        for ticker, entry, exit_price in trades:
            pid = journal.log_entry(ticker, entry, 100, stop=96.0, target=112.0,
                                    db_path=tmp_db)
            journal.log_exit(pid, exit_price, db_path=tmp_db)

    def test_r_multiple(self):
        assert journal.r_multiple(100.0, 108.0, 96.0) == pytest.approx(2.0)
        assert journal.r_multiple(100.0, 96.0, 96.0) == pytest.approx(-1.0)
        assert journal.r_multiple(100.0, 108.0, None) is None

    def test_win_rate_avg_r_expectancy(self, tmp_db):
        self.seed_trades(tmp_db)
        s = journal.stats(db_path=tmp_db)
        assert s["trades"] == 3
        assert s["win_rate"] == pytest.approx(2 / 3)
        assert s["avg_r"] == pytest.approx((2.0 + 1.0 - 1.0) / 3)
        # expectancy = 2/3 * avg_win(1.5R) + 1/3 * avg_loss(-1R)
        assert s["expectancy_r"] == pytest.approx(2 / 3 * 1.5 + 1 / 3 * -1.0)
        assert s["total_pnl"] == pytest.approx(800.0 + 400.0 - 400.0)

    def test_current_month_pnl_pct_feeds_breaker(self, tmp_db):
        self.seed_trades(tmp_db)
        pct = journal.current_month_pnl_pct(100_000.0, db_path=tmp_db)
        assert pct == pytest.approx(800.0 / 100_000.0)

    def test_monthly_pnl_grouping(self, tmp_db):
        pid = journal.log_entry("OLD", 100.0, 100, stop=96.0, target=112.0,
                                entry_date="2026-05-01T10:00:00+00:00", db_path=tmp_db)
        journal.log_exit(pid, 90.0, exit_date="2026-05-15T10:00:00+00:00", db_path=tmp_db)
        self.seed_trades(tmp_db)
        monthly = journal.monthly_pnl(db_path=tmp_db)
        assert len(monthly) == 2
        may = monthly[monthly["month"] == "2026-05"]
        assert may["pnl"].iloc[0] == pytest.approx(-1000.0)

    def test_empty_db_stats(self, tmp_db):
        s = journal.stats(db_path=tmp_db)
        assert s["trades"] == 0 and np.isnan(s["win_rate"])
        assert journal.current_month_pnl_pct(100_000.0, db_path=tmp_db) == 0.0


class TestKvState:
    def test_kv_roundtrip(self, tmp_db):
        assert db.kv_get("regime", db_path=tmp_db) is None
        assert db.kv_get("regime", default="RISK-ON", db_path=tmp_db) == "RISK-ON"
        db.kv_set("regime", "RISK-OFF", db_path=tmp_db)
        assert db.kv_get("regime", db_path=tmp_db) == "RISK-OFF"
        db.kv_set("regime", "RISK-ON", db_path=tmp_db)
        assert db.kv_get("regime", db_path=tmp_db) == "RISK-ON"
