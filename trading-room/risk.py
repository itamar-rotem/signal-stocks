"""Portfolio-level risk layer, enforced everywhere.

* Earnings filter: block new entries within 5 trading days of earnings;
  warn (⚠ badge) when earnings are < 7 calendar days away.
* Market regime: SPY vs SMA200 and ^VIX. SPY < SMA200 or VIX > 30 => RISK-OFF
  (banner, suppress new BUY signals, note regime in alerts).
* Position caps: max 6 open positions, max 2 per GICS sector,
  max 6% total open account risk.
* Correlation guard: warn when 90d return correlation > 0.7 with any
  open position.
* Circuit breaker: current-month P&L <= -5% blocks new entries unless a
  manual override flag is set.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd

MAX_OPEN_POSITIONS = 6
MAX_PER_SECTOR = 2
MAX_TOTAL_RISK_PCT = 0.06  # 6% of account across all open positions
CORRELATION_THRESHOLD = 0.7
CORRELATION_WINDOW = 90
VIX_RISK_OFF_LEVEL = 30.0
EARNINGS_BLOCK_TRADING_DAYS = 5
EARNINGS_WARN_CALENDAR_DAYS = 7
CIRCUIT_BREAKER_MONTH_PNL = -0.05  # -5%

CIRCUIT_BREAKER_OVERRIDE_KEY = "circuit_breaker_override"


# ---------------------------------------------------------------- market regime

@dataclass(frozen=True)
class Regime:
    risk_off: bool
    spy_close: Optional[float]
    spy_sma200: Optional[float]
    vix: Optional[float]
    reasons: tuple[str, ...] = ()

    @property
    def label(self) -> str:
        return "RISK-OFF" if self.risk_off else "RISK-ON"

    def describe(self) -> str:
        if not self.reasons:
            return "RISK-ON: SPY above its 200-day SMA and VIX below 30."
        return "RISK-OFF: " + " ".join(self.reasons)


def market_regime(spy: pd.DataFrame, vix: Optional[pd.DataFrame]) -> Regime:
    """Compute the market regime from SPY daily bars and ^VIX daily bars."""
    reasons: list[str] = []
    spy_close = spy_sma200 = vix_level = None

    if spy is not None and not spy.empty and len(spy) >= 200:
        spy_close = float(spy["close"].iloc[-1])
        spy_sma200 = float(spy["close"].rolling(200).mean().iloc[-1])
        if spy_close < spy_sma200:
            reasons.append(
                f"SPY ({spy_close:,.2f}) is below its 200-day SMA ({spy_sma200:,.2f})."
            )
    if vix is not None and not vix.empty:
        vix_level = float(vix["close"].iloc[-1])
        if vix_level > VIX_RISK_OFF_LEVEL:
            reasons.append(f"VIX is elevated at {vix_level:.1f} (> {VIX_RISK_OFF_LEVEL:.0f}).")

    return Regime(
        risk_off=bool(reasons),
        spy_close=spy_close,
        spy_sma200=spy_sma200,
        vix=vix_level,
        reasons=tuple(reasons),
    )


# -------------------------------------------------------------- earnings filter

def trading_days_until(target: date, today: Optional[date] = None) -> Optional[int]:
    """Number of trading days (business days) from today until target."""
    today = today or date.today()
    if target < today:
        return None
    return len(pd.bdate_range(start=today, end=target)) - 1


def earnings_blocked(earnings_date: Optional[date], today: Optional[date] = None) -> bool:
    """True when a new entry must be blocked (earnings within 5 trading days)."""
    if earnings_date is None:
        return False
    days = trading_days_until(earnings_date, today)
    return days is not None and days <= EARNINGS_BLOCK_TRADING_DAYS


def earnings_warning(earnings_date: Optional[date], today: Optional[date] = None) -> bool:
    """True when the ⚠ badge should show (earnings < 7 calendar days away)."""
    if earnings_date is None:
        return False
    today = today or date.today()
    delta = (earnings_date - today).days
    return 0 <= delta < EARNINGS_WARN_CALENDAR_DAYS


# ------------------------------------------------------------ correlation guard

def correlation_warnings(
    candidate_returns: pd.Series,
    open_returns: dict[str, pd.Series],
    threshold: float = CORRELATION_THRESHOLD,
    window: int = CORRELATION_WINDOW,
) -> list[str]:
    """Tickers whose trailing-90d return correlation with the candidate > 0.7."""
    warnings: list[str] = []
    cand = candidate_returns.dropna().tail(window)
    for ticker, rets in open_returns.items():
        other = rets.dropna().tail(window)
        joined = pd.concat([cand, other], axis=1, join="inner").dropna()
        if len(joined) < 20:  # not enough overlap to judge
            continue
        corr = joined.iloc[:, 0].corr(joined.iloc[:, 1])
        if corr is not None and not np.isnan(corr) and corr > threshold:
            warnings.append(f"{ticker} (corr {corr:.2f})")
    return warnings


# -------------------------------------------------------------- circuit breaker

def circuit_breaker_tripped(month_pnl_pct: float, override: bool = False) -> bool:
    """True when new entries are blocked by the monthly loss circuit breaker."""
    return month_pnl_pct <= CIRCUIT_BREAKER_MONTH_PNL and not override


# ------------------------------------------------------------------ entry check

@dataclass
class EntryCheck:
    """Result of the full pre-entry gauntlet."""

    allowed: bool
    violations: list[str] = field(default_factory=list)  # hard blocks
    warnings: list[str] = field(default_factory=list)   # soft, informational


def position_risk(pos: dict) -> float:
    """Dollar risk of an open position: shares * (entry - stop)."""
    stop = pos.get("stop")
    if stop is None:
        return 0.0
    return max(float(pos["entry_price"]) - float(stop), 0.0) * float(pos["shares"])


def check_entry(
    ticker: str,
    sector: Optional[str],
    planned_risk: float,
    open_positions: list[dict],
    account_size: float,
    month_pnl_pct: float = 0.0,
    circuit_breaker_override: bool = False,
    regime: Optional[Regime] = None,
    earnings_date: Optional[date] = None,
    candidate_returns: Optional[pd.Series] = None,
    open_returns: Optional[dict[str, pd.Series]] = None,
    today: Optional[date] = None,
) -> EntryCheck:
    """Run every portfolio-level rule against a proposed new entry.

    Hard blocks (violations): position caps, sector cap, total risk cap,
    earnings within 5 trading days, circuit breaker, RISK-OFF regime.
    Soft warnings: correlation > 0.7, earnings < 7 calendar days.
    """
    check = EntryCheck(allowed=True)

    if any(p["ticker"] == ticker for p in open_positions):
        check.violations.append(f"Already holding an open position in {ticker}.")

    if len(open_positions) >= MAX_OPEN_POSITIONS:
        check.violations.append(
            f"Position cap reached ({len(open_positions)}/{MAX_OPEN_POSITIONS} open)."
        )

    if sector:
        in_sector = sum(1 for p in open_positions if (p.get("sector") or "") == sector)
        if in_sector >= MAX_PER_SECTOR:
            check.violations.append(
                f"Sector cap reached for {sector} ({in_sector}/{MAX_PER_SECTOR})."
            )

    open_risk = sum(position_risk(p) for p in open_positions)
    if account_size > 0 and (open_risk + planned_risk) / account_size > MAX_TOTAL_RISK_PCT:
        total_pct = (open_risk + planned_risk) / account_size * 100
        check.violations.append(
            f"Total open risk would be {total_pct:.1f}% of the account "
            f"(cap {MAX_TOTAL_RISK_PCT * 100:.0f}%)."
        )

    if earnings_blocked(earnings_date, today):
        check.violations.append(
            f"Earnings within {EARNINGS_BLOCK_TRADING_DAYS} trading days "
            f"({earnings_date:%Y-%m-%d}) — new entries blocked."
        )
    elif earnings_warning(earnings_date, today):
        check.warnings.append(f"⚠ Earnings on {earnings_date:%Y-%m-%d} (< 7 days away).")

    if circuit_breaker_tripped(month_pnl_pct, circuit_breaker_override):
        check.violations.append(
            f"Circuit breaker: month P&L {month_pnl_pct * 100:.1f}% <= -5%. "
            "New entries blocked (manual override required)."
        )

    if regime is not None and regime.risk_off:
        check.violations.append(f"Market is RISK-OFF: {' '.join(regime.reasons)}")

    if candidate_returns is not None and open_returns:
        corr_hits = correlation_warnings(candidate_returns, open_returns)
        if corr_hits:
            check.warnings.append(
                "High 90d correlation with open positions: " + ", ".join(corr_hits)
            )

    check.allowed = not check.violations
    return check
