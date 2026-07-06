"""Alpaca PAPER trading bridge: bracket orders only, never live money.

Uses alpaca-py with ``paper=True`` hard-coded. Requires ALPACA_API_KEY and
ALPACA_SECRET_KEY (paper keys) in .env. Every submitted order is logged to
the journal as a ``paper_order`` event.
"""

from __future__ import annotations

import os
from typing import Optional

import db


class BrokerError(RuntimeError):
    """Raised when the paper bridge cannot place an order."""


def paper_keys() -> Optional[tuple[str, str]]:
    """Return (key, secret) if Alpaca paper keys are configured."""
    key = os.environ.get("ALPACA_API_KEY", "").strip()
    secret = os.environ.get("ALPACA_SECRET_KEY", "").strip()
    return (key, secret) if key and secret else None


def is_available() -> bool:
    """True when alpaca-py is installed and paper keys are configured."""
    if paper_keys() is None:
        return False
    try:
        import alpaca  # noqa: F401
        return True
    except ImportError:
        return False


def send_paper_bracket(
    ticker: str,
    shares: int,
    stop: float,
    target: float,
    score: Optional[float] = None,
    db_path: Optional[str] = None,
) -> dict:
    """Place a PAPER bracket order: market entry + stop loss + take profit.

    Stop and target should come from signals.trade_plan (entry - 2*ATR,
    entry + 3*ATR). Returns a summary dict; raises BrokerError on failure.
    """
    keys = paper_keys()
    if keys is None:
        raise BrokerError(
            "Alpaca paper keys not configured. Set ALPACA_API_KEY and "
            "ALPACA_SECRET_KEY in .env (paper keys only)."
        )
    if shares <= 0:
        raise BrokerError("Share count must be positive.")
    try:
        from alpaca.trading.client import TradingClient
        from alpaca.trading.enums import OrderClass, OrderSide, TimeInForce
        from alpaca.trading.requests import (
            MarketOrderRequest,
            StopLossRequest,
            TakeProfitRequest,
        )
    except ImportError as exc:
        raise BrokerError("alpaca-py is not installed (pip install alpaca-py).") from exc

    client = TradingClient(keys[0], keys[1], paper=True)  # PAPER ONLY
    request = MarketOrderRequest(
        symbol=ticker,
        qty=shares,
        side=OrderSide.BUY,
        time_in_force=TimeInForce.GTC,
        order_class=OrderClass.BRACKET,
        take_profit=TakeProfitRequest(limit_price=round(target, 2)),
        stop_loss=StopLossRequest(stop_price=round(stop, 2)),
    )
    try:
        order = client.submit_order(request)
    except Exception as exc:
        raise BrokerError(f"Alpaca rejected the order: {exc}") from exc

    summary = {
        "order_id": str(order.id),
        "ticker": ticker,
        "shares": shares,
        "stop": round(stop, 2),
        "target": round(target, 2),
        "status": str(order.status),
    }
    db.journal_event(
        ticker, "paper_order", shares=shares, score=score,
        details=summary, db_path=db_path,
    )
    return summary
