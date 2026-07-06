"""Data layer: historical bars (yfinance), universe, earnings, live prices.

Free sources only:
  * Historical daily OHLCV + screening data: yfinance (no key needed).
  * Live prices, best available (graceful degradation):
      1. Finnhub websocket        -- if FINNHUB_API_KEY is set (LIVE)
      2. Alpaca IEX stream        -- if ALPACA paper keys are set (LIVE)
      3. yfinance 60s polling     -- always works, labeled DELAYED ~15min

Downloads are cached in-process with a 15-minute TTL. Screening uses
batch downloads. yfinance returns multi-index columns in several shapes
depending on version/arguments; ``_normalize`` flattens all of them to
lowercase single-level columns: open, high, low, close, volume.
"""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

CACHE_TTL_SECONDS = 15 * 60
_CACHE_DIR = Path(__file__).parent / ".cache"

_memory_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def _cache_get(key: str, ttl: float = CACHE_TTL_SECONDS):
    with _cache_lock:
        hit = _memory_cache.get(key)
        if hit and (time.time() - hit[0]) < ttl:
            return hit[1]
    return None


def _cache_put(key: str, value: object) -> None:
    with _cache_lock:
        _memory_cache[key] = (time.time(), value)


def clear_cache() -> None:
    """Drop all cached downloads (dashboard 'force refresh')."""
    with _cache_lock:
        _memory_cache.clear()


# ---------------------------------------------------------------- normalization

_OHLCV = ["open", "high", "low", "close", "volume"]


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten yfinance multi-index columns and lowercase names."""
    if df is None or df.empty:
        return pd.DataFrame(columns=_OHLCV)
    out = df.copy()
    if isinstance(out.columns, pd.MultiIndex):
        # Shapes seen in the wild: (field, ticker) or (ticker, field).
        level0 = [str(x) for x in out.columns.get_level_values(0)]
        fields = {"Open", "High", "Low", "Close", "Adj Close", "Volume"}
        if set(level0) & fields:
            out.columns = out.columns.get_level_values(0)
        else:
            out.columns = out.columns.get_level_values(1)
    out.columns = [str(c).lower().replace(" ", "_") for c in out.columns]
    if "close" not in out.columns and "adj_close" in out.columns:
        out["close"] = out["adj_close"]
    keep = [c for c in _OHLCV if c in out.columns]
    out = out[keep].dropna(subset=["close"])
    out.index = pd.to_datetime(out.index).tz_localize(None)
    return out


def _split_batch(df: pd.DataFrame, tickers: list[str]) -> dict[str, pd.DataFrame]:
    """Split a multi-ticker yf.download frame into per-ticker OHLCV frames."""
    result: dict[str, pd.DataFrame] = {}
    if df is None or df.empty:
        return result
    if not isinstance(df.columns, pd.MultiIndex):
        # Single ticker came back flat.
        if len(tickers) == 1:
            result[tickers[0]] = _normalize(df)
        return result
    level0 = [str(x) for x in df.columns.get_level_values(0)]
    ticker_level = 0 if set(level0) & set(tickers) else 1
    for t in tickers:
        try:
            sub = df.xs(t, axis=1, level=ticker_level)
        except KeyError:
            continue
        norm = _normalize(sub)
        if not norm.empty:
            result[t] = norm
    return result


# ------------------------------------------------------------------- historical

_PERIOD_DAYS = {"5d": 5, "1mo": 21, "3mo": 63, "6mo": 126, "1y": 252,
                "2y": 504, "5y": 1260, "10y": 2520, "max": 2520}


def synthetic_mode() -> bool:
    """TRADING_ROOM_SYNTHETIC=1 swaps all history for deterministic
    random-walk data — offline demo only, clearly NOT real prices."""
    return os.environ.get("TRADING_ROOM_SYNTHETIC", "").strip() == "1"


def get_history(ticker: str, period: str = "2y", interval: str = "1d") -> pd.DataFrame:
    """Daily OHLCV for one ticker, cached for 15 minutes."""
    if synthetic_mode():
        return synthetic_history(ticker, days=_PERIOD_DAYS.get(period, 504))
    key = f"hist:{ticker}:{period}:{interval}"
    cached = _cache_get(key)
    if cached is not None:
        return cached.copy()
    import yfinance as yf

    raw = yf.download(
        ticker, period=period, interval=interval,
        auto_adjust=True, progress=False, group_by="column",
    )
    df = _normalize(raw)
    _cache_put(key, df)
    return df.copy()


def batch_history(
    tickers: list[str], period: str = "1y", interval: str = "1d", chunk_size: int = 100
) -> dict[str, pd.DataFrame]:
    """Batch-download daily OHLCV for many tickers (for screening)."""
    tickers = [t.upper().strip() for t in tickers if t.strip()]
    if synthetic_mode():
        days = _PERIOD_DAYS.get(period, 504)
        return {t: synthetic_history(t, days=days) for t in tickers}
    key = f"batch:{','.join(sorted(tickers))}:{period}:{interval}"
    cached = _cache_get(key)
    if cached is not None:
        return {k: v.copy() for k, v in cached.items()}
    import yfinance as yf

    result: dict[str, pd.DataFrame] = {}
    for i in range(0, len(tickers), chunk_size):
        chunk = tickers[i : i + chunk_size]
        raw = yf.download(
            chunk, period=period, interval=interval,
            auto_adjust=True, progress=False, group_by="ticker", threads=True,
        )
        result.update(_split_batch(raw, chunk))
    _cache_put(key, result)
    return {k: v.copy() for k, v in result.items()}


# --------------------------------------------------------------------- universe

# Offline fallback so the app still works if Wikipedia is unreachable.
FALLBACK_UNIVERSE: list[tuple[str, str]] = [
    ("AAPL", "Information Technology"), ("MSFT", "Information Technology"),
    ("NVDA", "Information Technology"), ("AVGO", "Information Technology"),
    ("ORCL", "Information Technology"), ("CRM", "Information Technology"),
    ("AMD", "Information Technology"), ("ADBE", "Information Technology"),
    ("AMZN", "Consumer Discretionary"), ("TSLA", "Consumer Discretionary"),
    ("HD", "Consumer Discretionary"), ("MCD", "Consumer Discretionary"),
    ("NKE", "Consumer Discretionary"), ("GOOGL", "Communication Services"),
    ("META", "Communication Services"), ("NFLX", "Communication Services"),
    ("DIS", "Communication Services"), ("TMUS", "Communication Services"),
    ("BRK-B", "Financials"), ("JPM", "Financials"), ("V", "Financials"),
    ("MA", "Financials"), ("BAC", "Financials"), ("GS", "Financials"),
    ("LLY", "Health Care"), ("UNH", "Health Care"), ("JNJ", "Health Care"),
    ("ABBV", "Health Care"), ("MRK", "Health Care"), ("TMO", "Health Care"),
    ("XOM", "Energy"), ("CVX", "Energy"), ("COP", "Energy"),
    ("PG", "Consumer Staples"), ("KO", "Consumer Staples"),
    ("PEP", "Consumer Staples"), ("WMT", "Consumer Staples"),
    ("COST", "Consumer Staples"), ("CAT", "Industrials"), ("GE", "Industrials"),
    ("UNP", "Industrials"), ("BA", "Industrials"), ("HON", "Industrials"),
    ("LIN", "Materials"), ("SHW", "Materials"), ("NEE", "Utilities"),
    ("DUK", "Utilities"), ("PLD", "Real Estate"), ("AMT", "Real Estate"),
]

_SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
_SP500_DISK_CACHE = _CACHE_DIR / "sp500.json"
_SP500_DISK_TTL = 24 * 3600


def get_sp500() -> pd.DataFrame:
    """S&P 500 constituents with GICS sectors from Wikipedia.

    Falls back to a bundled large-cap list when Wikipedia is unreachable
    (column ``source`` says which one you got).
    """
    cached = _cache_get("sp500", ttl=_SP500_DISK_TTL)
    if cached is not None:
        return cached.copy()

    # Disk cache survives process restarts.
    if _SP500_DISK_CACHE.exists():
        age = time.time() - _SP500_DISK_CACHE.stat().st_mtime
        if age < _SP500_DISK_TTL:
            try:
                records = json.loads(_SP500_DISK_CACHE.read_text())
                df = pd.DataFrame(records)
                _cache_put("sp500", df)
                return df.copy()
            except (json.JSONDecodeError, ValueError):
                pass

    try:
        import requests

        resp = requests.get(
            _SP500_URL, timeout=20,
            headers={"User-Agent": "Mozilla/5.0 (trading-room; personal research)"},
        )
        resp.raise_for_status()
        tables = pd.read_html(resp.text)
        table = next(t for t in tables if "Symbol" in t.columns)
        df = pd.DataFrame(
            {
                "ticker": table["Symbol"].astype(str).str.replace(".", "-", regex=False),
                "name": table["Security"].astype(str),
                "sector": table["GICS Sector"].astype(str),
            }
        )
        df["source"] = "wikipedia"
        _CACHE_DIR.mkdir(exist_ok=True)
        _SP500_DISK_CACHE.write_text(json.dumps(df.to_dict(orient="records")))
    except Exception:
        df = pd.DataFrame(FALLBACK_UNIVERSE, columns=["ticker", "sector"])
        df["name"] = df["ticker"]
        df["source"] = "fallback"
    _cache_put("sp500", df)
    return df.copy()


# --------------------------------------------------------------------- earnings

def next_earnings_date(ticker: str) -> Optional[date]:
    """Next scheduled earnings date via yfinance, or None if unknown.

    yfinance's calendar shape has changed across versions; handle both the
    dict and the DataFrame form defensively.
    """
    key = f"earnings:{ticker}"
    cached = _cache_get(key, ttl=24 * 3600)
    if cached is not None:
        return cached if isinstance(cached, date) else None
    result: Optional[date] = None
    try:
        import yfinance as yf

        cal = yf.Ticker(ticker).calendar
        raw = None
        if isinstance(cal, dict):
            raw = cal.get("Earnings Date")
        elif isinstance(cal, pd.DataFrame) and not cal.empty:
            if "Earnings Date" in cal.index:
                raw = cal.loc["Earnings Date"].iloc[0]
        if isinstance(raw, (list, tuple, np.ndarray)) and len(raw):
            raw = raw[0]
        if raw is not None:
            ts = pd.Timestamp(raw)
            if not pd.isna(ts):
                result = ts.date()
    except Exception:
        result = None
    _cache_put(key, result if result is not None else "none")
    return result


# ------------------------------------------------------------------ live prices

@dataclass
class Quote:
    price: float
    ts: float  # unix seconds


class LivePriceProvider:
    """Base class: keeps a thread-safe map of last prices per ticker."""

    #: 'LIVE' or 'DELAYED' — shown as a badge in the UI.
    status: str = "DELAYED"
    label: str = "unknown"

    def __init__(self, tickers: list[str]) -> None:
        self.tickers = [t.upper() for t in tickers]
        self._quotes: dict[str, Quote] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()

    def start(self) -> None:  # pragma: no cover - thread wiring
        raise NotImplementedError

    def stop(self) -> None:
        self._stop.set()

    def _put(self, ticker: str, price: float) -> None:
        with self._lock:
            self._quotes[ticker.upper()] = Quote(price=float(price), ts=time.time())

    def get_price(self, ticker: str) -> Optional[float]:
        q = self.get_quote(ticker)
        return q.price if q else None

    def get_quote(self, ticker: str) -> Optional[Quote]:
        with self._lock:
            return self._quotes.get(ticker.upper())


class FinnhubProvider(LivePriceProvider):
    """Live trades over the Finnhub websocket (requires FINNHUB_API_KEY)."""

    status = "LIVE"
    label = "Finnhub websocket"

    def __init__(self, tickers: list[str], api_key: str) -> None:
        super().__init__(tickers)
        self._api_key = api_key
        self._ws = None

    def start(self) -> None:  # pragma: no cover - network
        import websocket

        def on_open(ws) -> None:
            for t in self.tickers:
                ws.send(json.dumps({"type": "subscribe", "symbol": t}))

        def on_message(ws, message: str) -> None:
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                return
            if payload.get("type") == "trade":
                for trade in payload.get("data", []):
                    symbol, price = trade.get("s"), trade.get("p")
                    if symbol and price:
                        self._put(symbol, price)

        def run() -> None:
            while not self._stop.is_set():
                try:
                    self._ws = websocket.WebSocketApp(
                        f"wss://ws.finnhub.io?token={self._api_key}",
                        on_open=on_open,
                        on_message=on_message,
                    )
                    self._ws.run_forever(ping_interval=20)
                except Exception:
                    pass
                if not self._stop.is_set():
                    time.sleep(5)  # reconnect backoff

        threading.Thread(target=run, daemon=True, name="finnhub-ws").start()

    def stop(self) -> None:  # pragma: no cover - network
        super().stop()
        if self._ws is not None:
            try:
                self._ws.close()
            except Exception:
                pass


class AlpacaProvider(LivePriceProvider):
    """Live IEX trades via alpaca-py (requires paper API keys)."""

    status = "LIVE"
    label = "Alpaca IEX stream"

    def __init__(self, tickers: list[str], api_key: str, secret_key: str) -> None:
        super().__init__(tickers)
        self._api_key = api_key
        self._secret_key = secret_key
        self._stream = None

    def start(self) -> None:  # pragma: no cover - network
        from alpaca.data.live import StockDataStream

        stream = StockDataStream(self._api_key, self._secret_key)
        self._stream = stream

        async def on_trade(trade) -> None:
            self._put(trade.symbol, trade.price)

        stream.subscribe_trades(on_trade, *self.tickers)

        def run() -> None:
            try:
                stream.run()
            except Exception:
                pass

        threading.Thread(target=run, daemon=True, name="alpaca-stream").start()

    def stop(self) -> None:  # pragma: no cover - network
        super().stop()
        if self._stream is not None:
            try:
                self._stream.stop()
            except Exception:
                pass


class YFinancePoller(LivePriceProvider):
    """Zero-key fallback: poll yfinance every 60s. Quotes are DELAYED ~15min."""

    status = "DELAYED"
    label = "yfinance polling (DELAYED ~15min)"

    def __init__(self, tickers: list[str], interval_seconds: int = 60) -> None:
        super().__init__(tickers)
        self.interval_seconds = interval_seconds

    def poll_once(self) -> None:  # pragma: no cover - network
        import yfinance as yf

        for t in self.tickers:
            try:
                info = yf.Ticker(t).fast_info
                price = getattr(info, "last_price", None) or info.get("lastPrice")
                if price:
                    self._put(t, float(price))
            except Exception:
                continue

    def start(self) -> None:  # pragma: no cover - network
        def run() -> None:
            while not self._stop.is_set():
                self.poll_once()
                self._stop.wait(self.interval_seconds)

        threading.Thread(target=run, daemon=True, name="yf-poller").start()


def get_live_provider(tickers: list[str]) -> LivePriceProvider:
    """Best available live-price provider, degrading gracefully to zero-key."""
    finnhub_key = os.environ.get("FINNHUB_API_KEY", "").strip()
    if finnhub_key:
        return FinnhubProvider(tickers, finnhub_key)
    alpaca_key = os.environ.get("ALPACA_API_KEY", "").strip()
    alpaca_secret = os.environ.get("ALPACA_SECRET_KEY", "").strip()
    if alpaca_key and alpaca_secret:
        try:
            import alpaca  # noqa: F401
            return AlpacaProvider(tickers, alpaca_key, alpaca_secret)
        except ImportError:
            pass
    return YFinancePoller(tickers)


# ------------------------------------------------------------------- synthetic

def synthetic_history(
    ticker: str = "SYN",
    days: int = 2520,
    seed: Optional[int] = None,
    start_price: float = 100.0,
) -> pd.DataFrame:
    """Deterministic synthetic OHLCV for tests and offline demos.

    Regime-switching geometric random walk: alternating bull/bear/chop
    segments so trend, momentum and volatility indicators all get exercised.
    Clearly NOT real market data.
    """
    rng = np.random.default_rng(seed if seed is not None else abs(hash(ticker)) % 2**32)
    regimes = []
    remaining = days
    while remaining > 0:
        length = int(rng.integers(60, 250))
        drift = rng.choice([0.0008, -0.0006, 0.0001])
        vol = rng.choice([0.010, 0.018, 0.030])
        regimes.append((min(length, remaining), drift, vol))
        remaining -= length
    rets = np.concatenate(
        [rng.normal(drift, vol, size=length) for length, drift, vol in regimes]
    )
    close = start_price * np.exp(np.cumsum(rets))
    open_ = close * (1 + rng.normal(0, 0.003, size=days))
    spread = np.abs(rng.normal(0, 0.008, size=days))
    high = np.maximum(open_, close) * (1 + spread)
    low = np.minimum(open_, close) * (1 - spread)
    volume = rng.integers(1_000_000, 20_000_000, size=days).astype(float)
    index = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=days)
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=index,
    )
