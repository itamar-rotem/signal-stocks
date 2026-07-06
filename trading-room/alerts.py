"""Signal-flip and regime alerts via Telegram, plus a weekly Sunday report.

Usage:
    python alerts.py                # one watchlist check
    python alerts.py --daemon      # every 15 min during US market hours
    python alerts.py --weekly      # send the weekly summary now
    python alerts.py --tickers AAPL,NVDA   # override the stored watchlist

Cron alternative to --daemon (runs the daily post-close check at
23:15 Israel time, Mon-Fri; US close 16:00 ET == 23:00 Israel in summer):

    15 23 * * 1-5  cd /path/to/trading-room && .venv/bin/python alerts.py >> alerts.log 2>&1

Weekly report on Sundays at 18:00 Israel time:

    0 18 * * 0     cd /path/to/trading-room && .venv/bin/python alerts.py --weekly >> alerts.log 2>&1

Telegram credentials come from .env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).
Without them, alerts print to stdout so everything still works with no keys.

Not financial advice — signals are informational only.
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import pandas as pd

import data
import db
import journal
import risk
import signals as sig

CHECK_INTERVAL_SECONDS = 15 * 60
MARKET_TZ = ZoneInfo("America/New_York")
LAST_REGIME_KEY = "last_regime"


# -------------------------------------------------------------------- telegram

def send_telegram(text: str, token: Optional[str] = None, chat_id: Optional[str] = None) -> bool:
    """Send a message via Telegram; fall back to stdout when unconfigured."""
    token = token or os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = chat_id or os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        print(f"[alert / telegram-not-configured]\n{text}\n")
        return False
    import requests

    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=15,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        print(f"[alert] Telegram send failed ({exc}); message was:\n{text}\n")
        return False


# ------------------------------------------------------------------- the check

def is_market_hours(now: Optional[datetime] = None) -> bool:
    """True during regular US market hours: 9:30-16:00 ET, weekdays."""
    now = (now or datetime.now(timezone.utc)).astimezone(MARKET_TZ)
    if now.weekday() >= 5:
        return False
    minutes = now.hour * 60 + now.minute
    return (9 * 60 + 30) <= minutes <= (16 * 60)


def get_regime() -> risk.Regime:
    spy = data.get_history("SPY", period="2y")
    try:
        vix = data.get_history("^VIX", period="6mo")
    except Exception:
        vix = None
    return risk.market_regime(spy, vix)


def check_watchlist(
    tickers: Optional[list[str]] = None, db_path: Optional[str] = None
) -> list[str]:
    """Compare fresh signals against saved state; alert on any flip.

    Returns the list of messages sent (useful for testing/logging).
    """
    tickers = tickers or db.ensure_default_watchlist(db_path)
    messages: list[str] = []

    # Regime first — flips get their own alert and annotate signal alerts.
    regime = get_regime()
    last_regime = db.kv_get(LAST_REGIME_KEY, db_path=db_path)
    if last_regime is not None and last_regime != regime.label:
        msg = (
            f"🌤 Market regime change: {last_regime} → <b>{regime.label}</b>\n"
            f"{regime.describe()}"
        )
        send_telegram(msg)
        messages.append(msg)
    db.kv_set(LAST_REGIME_KEY, regime.label, db_path=db_path)

    history = data.batch_history(tickers, period="2y")
    saved = db.get_all_signal_state(db_path)

    for ticker in tickers:
        df = history.get(ticker)
        if df is None or len(df) < 210:
            continue
        scored = sig.compute_scores(df)
        last = scored.iloc[-1]
        if pd.isna(last["score"]):
            continue
        score = float(last["score"])
        price = float(last["close"])
        atr14 = float(last["atr14"])

        # Alert thresholds use hysteresis (enter >= 60 / exit <= 45) so we
        # don't ping on every wobble around the plain BUY/SELL cutoffs.
        prev = saved.get(ticker)
        prev_signal = prev["signal"] if prev else None
        new_signal = str(last["signal"])

        if prev_signal is not None and new_signal != prev_signal:
            stop = price - 2.0 * atr14
            note = f"\n⚠ Regime is {regime.label}." if regime.risk_off else ""
            if regime.risk_off and new_signal == "BUY":
                note += " New BUY signals are suppressed — flagged for information only."
            msg = (
                f"🔔 <b>{ticker}</b>: {prev_signal} → <b>{new_signal}</b>\n"
                f"Score {score:.0f}/100 at ${price:,.2f}\n"
                f"Suggested stop: ${stop:,.2f} (2×ATR)"
                f"{note}\n"
                f"Not financial advice."
            )
            send_telegram(msg)
            messages.append(msg)

        db.set_signal_state(ticker, new_signal, score, price, db_path=db_path)
        db.record_signal_history(
            ticker, scored.index[-1].strftime("%Y-%m-%d"), new_signal, score, price,
            db_path=db_path,
        )
    return messages


# --------------------------------------------------------------- weekly report

def weekly_report(db_path: Optional[str] = None, account_size: Optional[float] = None) -> str:
    """Sunday summary: positions, month P&L, best/worst trades, regime, earnings."""
    account_size = account_size or float(os.environ.get("ACCOUNT_SIZE", "100000"))
    regime = get_regime()
    lines: list[str] = ["📊 <b>Weekly trading-room report</b>", ""]
    lines.append(f"Market regime: <b>{regime.label}</b> — {regime.describe()}")

    open_positions = db.get_open_positions(db_path)
    if open_positions:
        lines.append("")
        lines.append(f"Open positions ({len(open_positions)}):")
        prices = {}
        try:
            history = data.batch_history([p["ticker"] for p in open_positions], period="5d")
            prices = {t: float(df["close"].iloc[-1]) for t, df in history.items() if len(df)}
        except Exception:
            pass
        for pos in open_positions:
            view = journal.position_pnl(pos, prices.get(pos["ticker"]))
            pnl = f"{view['pnl']:+,.0f}" if not pd.isna(view["pnl"]) else "?"
            lines.append(
                f"  • {pos['ticker']}: {pos['shares']:.0f} sh @ ${pos['entry_price']:,.2f} "
                f"(P&L ${pnl})"
            )
    else:
        lines.append("\nNo open positions.")

    month_pnl = journal.current_month_pnl_pct(account_size, db_path)
    lines.append(f"\nMonth realized P&L: {month_pnl * 100:+.1f}% of account")
    if risk.circuit_breaker_tripped(month_pnl):
        lines.append("🚨 Circuit breaker is TRIPPED — new entries blocked.")

    trades = journal.closed_trades_frame(db_path)
    if not trades.empty:
        recent = trades.tail(20)
        best = recent.loc[recent["pnl"].idxmax()]
        worst = recent.loc[recent["pnl"].idxmin()]
        lines.append(
            f"Best recent trade: {best['ticker']} ${best['pnl']:+,.0f} | "
            f"Worst: {worst['ticker']} ${worst['pnl']:+,.0f}"
        )

    # Upcoming earnings on the watchlist.
    watchlist = db.get_watchlist(db_path)
    upcoming: list[str] = []
    for ticker in watchlist:
        edate = data.next_earnings_date(ticker)
        if edate and risk.earnings_warning(edate) or (edate and risk.earnings_blocked(edate)):
            upcoming.append(f"{ticker} ({edate:%b %d})")
    if upcoming:
        lines.append("⚠ Earnings soon: " + ", ".join(upcoming))

    lines.append("\nNot financial advice.")
    report = "\n".join(lines)
    send_telegram(report)
    return report


# ---------------------------------------------------------------------- daemon

def run_daemon(tickers: Optional[list[str]] = None) -> None:  # pragma: no cover
    """Check every 15 minutes during US market hours; sleep otherwise."""
    print("Alert daemon started. Checking every 15 min during US market hours.")
    print("(9:30-16:00 ET, weekdays). Ctrl-C to stop.")
    while True:
        if is_market_hours():
            try:
                sent = check_watchlist(tickers)
                stamp = datetime.now(timezone.utc).astimezone(MARKET_TZ).strftime("%H:%M ET")
                print(f"[{stamp}] check complete, {len(sent)} alert(s) sent")
            except Exception as exc:
                print(f"[daemon] check failed: {exc}")
        else:
            print("[daemon] outside market hours, sleeping...")
        time.sleep(CHECK_INTERVAL_SECONDS)


def main() -> None:  # pragma: no cover
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--daemon", action="store_true",
                        help="run continuously, every 15 min during market hours")
    parser.add_argument("--weekly", action="store_true", help="send the weekly report now")
    parser.add_argument("--tickers", type=str, default="",
                        help="comma-separated tickers (default: stored watchlist)")
    args = parser.parse_args()

    tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()] or None
    if args.weekly:
        weekly_report()
    elif args.daemon:
        run_daemon(tickers)
    else:
        sent = check_watchlist(tickers)
        print(f"Check complete. {len(sent)} alert(s) sent.")


if __name__ == "__main__":
    main()
