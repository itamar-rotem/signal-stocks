"""Thin SQLite data-access layer for the trading room.

All persistent state lives in a single SQLite file (default: trading.db
next to this module, overridable via the TRADING_DB env var or an explicit
``db_path`` argument on every function — the explicit argument exists so
tests can point at a temp file).

Tables:
    signal_state   -- last known signal per ticker (for flip detection)
    signal_history -- daily signal/score snapshots
    positions      -- open & closed positions
    journal        -- every event: entries, exits, skipped signals, paper orders
    kv_state       -- misc state: last regime, circuit-breaker override, etc.
    watchlist      -- tickers the alert daemon and dashboard watch
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

DEFAULT_DB_PATH = os.environ.get("TRADING_DB", str(Path(__file__).parent / "trading.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS signal_state (
    ticker      TEXT PRIMARY KEY,
    signal      TEXT NOT NULL,
    score       REAL NOT NULL,
    price       REAL,
    updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signal_history (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker  TEXT NOT NULL,
    date    TEXT NOT NULL,
    signal  TEXT NOT NULL,
    score   REAL NOT NULL,
    price   REAL,
    UNIQUE (ticker, date)
);
CREATE TABLE IF NOT EXISTS positions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker      TEXT NOT NULL,
    side        TEXT NOT NULL DEFAULT 'long',
    entry_date  TEXT NOT NULL,
    entry_price REAL NOT NULL,
    shares      REAL NOT NULL,
    stop        REAL,
    target      REAL,
    sector      TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    exit_date   TEXT,
    exit_price  REAL,
    notes       TEXT
);
CREATE TABLE IF NOT EXISTS journal (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,
    ticker  TEXT NOT NULL,
    event   TEXT NOT NULL,
    price   REAL,
    shares  REAL,
    score   REAL,
    details TEXT
);
CREATE TABLE IF NOT EXISTS kv_state (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watchlist (
    ticker   TEXT PRIMARY KEY,
    added_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect(db_path: Optional[str] = None) -> Iterator[sqlite3.Connection]:
    """Yield a connection with the schema applied; commits on success."""
    path = db_path or DEFAULT_DB_PATH
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(_SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------- signal state

def get_signal_state(ticker: str, db_path: Optional[str] = None) -> Optional[dict[str, Any]]:
    with connect(db_path) as conn:
        row = conn.execute("SELECT * FROM signal_state WHERE ticker = ?", (ticker,)).fetchone()
        return dict(row) if row else None


def get_all_signal_state(db_path: Optional[str] = None) -> dict[str, dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute("SELECT * FROM signal_state").fetchall()
        return {r["ticker"]: dict(r) for r in rows}


def set_signal_state(
    ticker: str,
    signal: str,
    score: float,
    price: Optional[float] = None,
    db_path: Optional[str] = None,
) -> None:
    with connect(db_path) as conn:
        conn.execute(
            """INSERT INTO signal_state (ticker, signal, score, price, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(ticker) DO UPDATE SET
                 signal = excluded.signal, score = excluded.score,
                 price = excluded.price, updated_at = excluded.updated_at""",
            (ticker, signal, float(score), price, _now()),
        )


def record_signal_history(
    ticker: str,
    date: str,
    signal: str,
    score: float,
    price: Optional[float] = None,
    db_path: Optional[str] = None,
) -> None:
    with connect(db_path) as conn:
        conn.execute(
            """INSERT INTO signal_history (ticker, date, signal, score, price)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(ticker, date) DO UPDATE SET
                 signal = excluded.signal, score = excluded.score, price = excluded.price""",
            (ticker, date, signal, float(score), price),
        )


def get_signal_history(ticker: str, db_path: Optional[str] = None) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM signal_history WHERE ticker = ? ORDER BY date", (ticker,)
        ).fetchall()
        return [dict(r) for r in rows]


# ------------------------------------------------------------------- positions

def open_position(
    ticker: str,
    entry_price: float,
    shares: float,
    stop: Optional[float] = None,
    target: Optional[float] = None,
    sector: Optional[str] = None,
    side: str = "long",
    entry_date: Optional[str] = None,
    notes: Optional[str] = None,
    db_path: Optional[str] = None,
) -> int:
    with connect(db_path) as conn:
        cur = conn.execute(
            """INSERT INTO positions
               (ticker, side, entry_date, entry_price, shares, stop, target, sector, status, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)""",
            (ticker, side, entry_date or _now(), float(entry_price), float(shares),
             stop, target, sector, notes),
        )
        return int(cur.lastrowid)


def close_position(
    position_id: int,
    exit_price: float,
    exit_date: Optional[str] = None,
    notes: Optional[str] = None,
    db_path: Optional[str] = None,
) -> None:
    with connect(db_path) as conn:
        conn.execute(
            """UPDATE positions
               SET status = 'closed', exit_price = ?, exit_date = ?,
                   notes = COALESCE(?, notes)
               WHERE id = ? AND status = 'open'""",
            (float(exit_price), exit_date or _now(), notes, position_id),
        )


def get_open_positions(db_path: Optional[str] = None) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM positions WHERE status = 'open' ORDER BY entry_date"
        ).fetchall()
        return [dict(r) for r in rows]


def get_closed_positions(db_path: Optional[str] = None) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM positions WHERE status = 'closed' ORDER BY exit_date"
        ).fetchall()
        return [dict(r) for r in rows]


# --------------------------------------------------------------------- journal

def journal_event(
    ticker: str,
    event: str,
    price: Optional[float] = None,
    shares: Optional[float] = None,
    score: Optional[float] = None,
    details: Optional[dict[str, Any]] = None,
    ts: Optional[str] = None,
    db_path: Optional[str] = None,
) -> int:
    with connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO journal (ts, ticker, event, price, shares, score, details)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (ts or _now(), ticker, event, price, shares, score,
             json.dumps(details) if details else None),
        )
        return int(cur.lastrowid)


def get_journal(db_path: Optional[str] = None, limit: int = 500) -> list[dict[str, Any]]:
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM journal ORDER BY ts DESC, id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


# -------------------------------------------------------------------- kv state

def kv_get(key: str, default: Optional[str] = None, db_path: Optional[str] = None) -> Optional[str]:
    with connect(db_path) as conn:
        row = conn.execute("SELECT value FROM kv_state WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def kv_set(key: str, value: str, db_path: Optional[str] = None) -> None:
    with connect(db_path) as conn:
        conn.execute(
            """INSERT INTO kv_state (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                              updated_at = excluded.updated_at""",
            (key, value, _now()),
        )


# ------------------------------------------------------------------- watchlist

DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "SPY"]


def get_watchlist(db_path: Optional[str] = None) -> list[str]:
    with connect(db_path) as conn:
        rows = conn.execute("SELECT ticker FROM watchlist ORDER BY ticker").fetchall()
        return [r["ticker"] for r in rows]


def add_to_watchlist(ticker: str, db_path: Optional[str] = None) -> None:
    with connect(db_path) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO watchlist (ticker, added_at) VALUES (?, ?)",
            (ticker.upper().strip(), _now()),
        )


def remove_from_watchlist(ticker: str, db_path: Optional[str] = None) -> None:
    with connect(db_path) as conn:
        conn.execute("DELETE FROM watchlist WHERE ticker = ?", (ticker.upper().strip(),))


def ensure_default_watchlist(db_path: Optional[str] = None) -> list[str]:
    """Seed the watchlist with a sensible default if it is empty."""
    wl = get_watchlist(db_path)
    if not wl:
        for t in DEFAULT_WATCHLIST:
            add_to_watchlist(t, db_path)
        wl = DEFAULT_WATCHLIST[:]
    return wl
