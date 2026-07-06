"""Streamlit trading-room dashboard.

Launch:  streamlit run dashboard.py

Tabs: Screener | Stock View | Live Watchlist | Journal & Positions.
Educational tool — NOT financial advice.
"""

from __future__ import annotations

import os
from datetime import date

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

import broker
import data
import db
import journal
import risk
import screener
import signals as sig

st.set_page_config(page_title="Trading Room", page_icon="📈", layout="wide")

DISCLAIMER = (
    "⚠️ **Not financial advice.** This dashboard is an educational/research tool. "
    "Signals are mechanical computations on historical data; they are not "
    "recommendations to buy or sell any security. Do your own research."
)


# ------------------------------------------------------------- cached fetchers

@st.cache_data(ttl=900, show_spinner=False)
def cached_history(ticker: str, period: str = "2y") -> pd.DataFrame:
    return data.get_history(ticker, period=period)


@st.cache_data(ttl=900, show_spinner="Downloading universe price data...")
def cached_batch(tickers: tuple[str, ...], period: str = "1y") -> dict[str, pd.DataFrame]:
    return data.batch_history(list(tickers), period=period)


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def cached_sp500() -> pd.DataFrame:
    return data.get_sp500()


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def cached_earnings(ticker: str) -> date | None:
    return data.next_earnings_date(ticker)


@st.cache_resource
def live_provider(tickers: tuple[str, ...]) -> data.LivePriceProvider:
    provider = data.get_live_provider(list(tickers))
    provider.start()
    return provider


@st.cache_data(ttl=900, show_spinner=False)
def cached_regime() -> risk.Regime:
    spy = data.get_history("SPY", period="2y")
    try:
        vix = data.get_history("^VIX", period="6mo")
    except Exception:
        vix = None
    return risk.market_regime(spy, vix)


def last_close_prices(tickers: list[str]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for t in tickers:
        try:
            df = cached_history(t, "3mo")
            out[t] = float(df["close"].iloc[-1]) if len(df) else None
        except Exception:
            out[t] = None
    return out


def best_price(ticker: str, provider: data.LivePriceProvider) -> tuple[float | None, str]:
    """Live price if the provider has one, else last daily close ('EOD')."""
    quote = provider.get_quote(ticker)
    if quote is not None:
        return quote.price, provider.status
    try:
        df = cached_history(ticker, "3mo")
        return (float(df["close"].iloc[-1]), "EOD") if len(df) else (None, "n/a")
    except Exception:
        return None, "n/a"


# --------------------------------------------------------------------- sidebar

with st.sidebar:
    st.title("📈 Trading Room")

    account_size = st.number_input(
        "Account size ($)", min_value=1000.0, step=1000.0,
        value=float(os.environ.get("ACCOUNT_SIZE", "100000")),
    )
    risk_pct = st.slider(
        "Risk per trade (%)", min_value=0.25, max_value=3.0, step=0.25,
        value=float(os.environ.get("RISK_PCT", "1.0")),
    ) / 100.0

    with st.expander("Telegram alerts"):
        st.text_input("Bot token", key="tg_token", type="password",
                      value=os.environ.get("TELEGRAM_BOT_TOKEN", ""))
        st.text_input("Chat id", key="tg_chat",
                      value=os.environ.get("TELEGRAM_CHAT_ID", ""))
        if st.button("Send test message"):
            import alerts
            ok = alerts.send_telegram(
                "✅ Trading-room test message.",
                token=st.session_state.tg_token, chat_id=st.session_state.tg_chat,
            )
            st.success("Sent!") if ok else st.warning("Not sent — check token/chat id.")

    st.divider()

    watchlist = db.ensure_default_watchlist()
    provider = live_provider(tuple(watchlist))
    if provider.status == "LIVE":
        st.success(f"Data source: 🟢 LIVE — {provider.label}")
    else:
        st.warning(f"Data source: 🟡 {provider.label}")

    regime = cached_regime()
    if regime.risk_off:
        st.error(f"🛑 {regime.label}: {regime.describe()}")
    else:
        st.success(f"✅ {regime.label} — {regime.describe()}")

    month_pnl_pct = journal.current_month_pnl_pct(account_size)
    breaker_override = db.kv_get(risk.CIRCUIT_BREAKER_OVERRIDE_KEY) == "1"
    breaker_tripped = risk.circuit_breaker_tripped(month_pnl_pct, breaker_override)
    if breaker_tripped:
        st.error(
            f"🚨 CIRCUIT BREAKER: month P&L {month_pnl_pct * 100:+.1f}% ≤ -5%. "
            "New entries blocked."
        )
        if st.checkbox("Manual override (I understand the risk)", value=False):
            db.kv_set(risk.CIRCUIT_BREAKER_OVERRIDE_KEY, "1")
            st.rerun()
    elif breaker_override:
        st.warning("Circuit-breaker override is ACTIVE.")
        if st.button("Clear override"):
            db.kv_set(risk.CIRCUIT_BREAKER_OVERRIDE_KEY, "0")
            st.rerun()

    if data.synthetic_mode():
        st.error("🧪 SYNTHETIC DATA MODE — random-walk demo data, NOT real prices "
                 "(unset TRADING_ROOM_SYNTHETIC to disable).")

    if st.button("🔄 Force refresh data"):
        data.clear_cache()
        st.cache_data.clear()
        st.rerun()

    st.caption(DISCLAIMER)


def entry_gauntlet(ticker: str, sector: str | None, planned_risk: float,
                   earnings_date: date | None) -> risk.EntryCheck:
    """Run the portfolio-level entry rules with current dashboard state."""
    return risk.check_entry(
        ticker=ticker, sector=sector, planned_risk=planned_risk,
        open_positions=db.get_open_positions(), account_size=account_size,
        month_pnl_pct=month_pnl_pct, circuit_breaker_override=breaker_override,
        regime=regime, earnings_date=earnings_date,
    )


tab_screener, tab_stock, tab_watch, tab_journal = st.tabs(
    ["🔎 Screener", "📊 Stock View", "📡 Live Watchlist", "📓 Journal & Positions"]
)

if regime.risk_off:
    st.error(f"🛑 **{regime.label}** — new BUY signals are suppressed. {regime.describe()}")


# ------------------------------------------------------------------ tab 1: screener

with tab_screener:
    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        universe_mode = st.radio(
            "Universe", ["S&P 500", "Custom list"], horizontal=True
        )
    with col2:
        top_n = st.number_input("Top N picks", min_value=3, max_value=25, value=8)
    with col3:
        sector_neutral = st.toggle("Sector-neutral (max 2/sector)", value=False)

    if universe_mode == "Custom list":
        custom = st.text_input(
            "Tickers (comma-separated)", value=", ".join(watchlist)
        )
        tickers = [t.strip().upper() for t in custom.split(",") if t.strip()]
        sectors: dict[str, str] = {}
    else:
        sp500 = cached_sp500()
        if (sp500["source"] == "fallback").all():
            st.info("Wikipedia unreachable — using the bundled large-cap fallback universe.")
        if len(sp500) > 50:
            limit = st.slider(
                "Universe size (first N constituents — smaller is faster)",
                min_value=50, max_value=len(sp500), value=min(150, len(sp500)),
            )
            sp500 = sp500.head(limit)
        tickers = sp500["ticker"].tolist()
        sectors = dict(zip(sp500["ticker"], sp500["sector"]))

    if st.button("Run screener", type="primary"):
        with st.spinner(f"Screening {len(tickers)} tickers..."):
            history = cached_batch(tuple(sorted(tickers)), "2y")
            spy = cached_history("SPY", "1y")
            st.session_state["screener_result"] = screener.run_screener(
                history, spy, sectors=sectors, top_n=int(top_n),
                sector_neutral=sector_neutral,
            )

    result: screener.ScreenerResult | None = st.session_state.get("screener_result")
    if result is None:
        st.info("Pick a universe and press **Run screener**.")
    elif result.table.empty:
        st.warning("No tickers survived the data/liquidity filters.")
    else:
        for note in result.notes:
            st.caption(note)
        st.caption(
            f"Universe {result.universe_size} → {result.filtered_size} after liquidity "
            f"filters (price > $5, 20d avg dollar volume > $20M)."
        )

        def pick_card(ticker: str, row: pd.Series, side: str) -> None:
            plan = sig.trade_plan(row["price"], row["atr14"], account_size, risk_pct)
            earnings_date = cached_earnings(ticker)
            check = entry_gauntlet(
                ticker, row.get("sector"), plan.risk_amount if plan else 0.0, earnings_date
            )
            blocked = (not check.allowed) and side == "long"
            with st.container(border=True):
                rank_col = "long_rank" if side == "long" else "short_rank"
                title = f"{'🟩' if side == 'long' else '🟥'} **{ticker}** — " \
                        f"${row['price']:,.2f} · score {row['score']:.0f} · " \
                        f"rank {row[rank_col]:.2f} · {row.get('sector', '')}"
                if blocked:
                    title = f"~~{title}~~ 🚫"
                st.markdown(title)
                if risk.earnings_warning(earnings_date) or risk.earnings_blocked(earnings_date):
                    st.markdown(f"⚠ **Earnings {earnings_date:%b %d}**")
                if row.get("vol_dampened"):
                    st.markdown("🌪 High-volatility regime — conviction halved")
                st.caption(row["reason"])
                if blocked:
                    for v in check.violations:
                        st.caption(f"🚫 {v}")
                for w in check.warnings:
                    st.caption(w)

        left, right = st.columns(2)
        with left:
            st.subheader("Long candidates")
            for ticker, row in result.longs.iterrows():
                pick_card(ticker, row, "long")
        with right:
            st.subheader("Short candidates")
            for ticker, row in result.shorts.iterrows():
                pick_card(ticker, row, "short")

        st.subheader("🚀 Daily movers")
        if result.movers.empty:
            st.caption("No movers today (rel. volume ≥ 3× or |gap| ≥ 4%).")
        else:
            st.dataframe(
                result.movers[["price", "score", "signal", "rel_volume", "gap",
                               "mover_reason"]].round(3),
                use_container_width=True,
            )

        with st.expander("Full ranked table"):
            st.dataframe(result.table.round(3), use_container_width=True)
        st.download_button(
            "⬇ Export CSV",
            result.table.to_csv().encode(),
            file_name="screener_results.csv",
            mime="text/csv",
        )


# ---------------------------------------------------------------- tab 2: stock view

with tab_stock:
    ticker = st.text_input("Ticker", value="AAPL").strip().upper()
    if ticker:
        try:
            hist = cached_history(ticker, "5y")
        except Exception as exc:
            hist = pd.DataFrame()
            st.error(f"Download failed for {ticker}: {exc}")
        if len(hist) < 210:
            if not hist.empty:
                st.warning(f"Only {len(hist)} bars for {ticker}; need 200+ for scoring.")
        else:
            scored = sig.compute_scores(hist)
            last = scored.iloc[-1]
            score = float(last["score"])
            signal = str(last["signal"])
            atr14 = float(last["atr14"])
            plan = sig.trade_plan(float(last["close"]), atr14, account_size, risk_pct)

            banner = {"BUY": st.success, "SELL": st.error}.get(signal, st.info)

            @st.fragment(run_every="5s")
            def price_banner() -> None:
                price, source = best_price(ticker, provider)
                badge = "🟢 LIVE" if source == "LIVE" else "🟡 DELAYED ~15min"
                price_txt = f"${price:,.2f}" if price is not None else "n/a"
                banner(
                    f"**{signal}** — {ticker} · score **{score:.0f}/100** · "
                    f"price {price_txt} ({badge})"
                )

            price_banner()

            if signal == "BUY" and regime.risk_off:
                st.warning("BUY signal shown for information only — regime is RISK-OFF, "
                           "new entries are suppressed.")

            if plan:
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Entry (last close)", f"${plan.entry:,.2f}")
                c2.metric("Stop (2×ATR)", f"${plan.stop:,.2f}")
                c3.metric("Target (3×ATR)", f"${plan.target:,.2f}")
                c4.metric("Shares", f"{plan.shares:,}",
                          help=f"Risking ${plan.risk_amount:,.0f} "
                               f"({risk_pct * 100:.2f}% of account)")

            # ---- chart: candles + SMAs + flip markers + score subplot
            window = scored.tail(300)
            flips = window["signal"].ne(window["signal"].shift())
            buy_flips = window[flips & (window["signal"] == "BUY")]
            sell_flips = window[flips & (window["signal"] == "SELL")]

            fig = make_subplots(
                rows=2, cols=1, shared_xaxes=True,
                row_heights=[0.72, 0.28], vertical_spacing=0.04,
            )
            fig.add_trace(go.Candlestick(
                x=window.index, open=window["open"], high=window["high"],
                low=window["low"], close=window["close"], name=ticker,
            ), row=1, col=1)
            fig.add_trace(go.Scatter(x=window.index, y=window["sma50"],
                                     name="SMA50", line=dict(width=1.2)), row=1, col=1)
            fig.add_trace(go.Scatter(x=window.index, y=window["sma200"],
                                     name="SMA200", line=dict(width=1.2)), row=1, col=1)
            fig.add_trace(go.Scatter(
                x=buy_flips.index, y=buy_flips["low"] * 0.98, mode="markers",
                name="→ BUY", marker=dict(symbol="triangle-up", size=12, color="green"),
            ), row=1, col=1)
            fig.add_trace(go.Scatter(
                x=sell_flips.index, y=sell_flips["high"] * 1.02, mode="markers",
                name="→ SELL", marker=dict(symbol="triangle-down", size=12, color="red"),
            ), row=1, col=1)
            if signal == "BUY" and plan:
                for level, label, color in (
                    (plan.entry, "Entry", "gray"),
                    (plan.stop, "Stop", "red"),
                    (plan.target, "Target", "green"),
                ):
                    fig.add_hline(y=level, line_dash="dot", line_color=color,
                                  annotation_text=f"{label} ${level:,.2f}", row=1, col=1)
            fig.add_trace(go.Scatter(x=window.index, y=window["score"], name="Score",
                                     line=dict(color="#6366f1")), row=2, col=1)
            fig.add_hline(y=60, line_dash="dot", line_color="green",
                          annotation_text="enter 60", row=2, col=1)
            fig.add_hline(y=45, line_dash="dot", line_color="red",
                          annotation_text="exit 45", row=2, col=1)
            fig.update_layout(
                height=650, xaxis_rangeslider_visible=False,
                legend=dict(orientation="h", y=1.02),
                margin=dict(l=40, r=40, t=30, b=30),
            )
            fig.update_yaxes(range=[0, 100], row=2, col=1)
            st.plotly_chart(fig, use_container_width=True)

            # ---- "why" panel
            st.subheader("Why this score?")
            contributions = [
                {"Component": sig.COMPONENT_LABELS[c], "Contribution": float(last[c])}
                for c in sig.COMPONENT_COLUMNS
            ]
            why = pd.DataFrame(contributions)
            why.loc[len(why)] = {"Component": "Baseline", "Contribution": 50.0}
            if bool(last["vol_dampened"]):
                why.loc[len(why)] = {
                    "Component": "Volatility regime (top 15% ATR%) — conviction halved",
                    "Contribution": float(last["score"]) - float(last["raw_score"]),
                }
            why.loc[len(why)] = {"Component": "TOTAL score", "Contribution": score}
            st.dataframe(why.round(1), use_container_width=True, hide_index=True)

            # ---- act on it
            earnings_date = cached_earnings(ticker)
            if earnings_date:
                if risk.earnings_blocked(earnings_date):
                    st.error(f"🚫 Earnings {earnings_date:%b %d} — within 5 trading days, "
                             "new entries blocked.")
                elif risk.earnings_warning(earnings_date):
                    st.warning(f"⚠ Earnings {earnings_date:%b %d} (< 7 days).")

            if plan and signal == "BUY":
                check = entry_gauntlet(ticker, None, plan.risk_amount, earnings_date)
                for v in check.violations:
                    st.error(f"🚫 {v}")
                for w in check.warnings:
                    st.warning(w)

                cols = st.columns(3)
                with cols[0]:
                    if st.button("📓 Log entry to journal", disabled=not check.allowed):
                        journal.log_entry(ticker, plan.entry, plan.shares, plan.stop,
                                          plan.target, score=score)
                        st.success("Logged.")
                with cols[1]:
                    if st.button("🙅 Log as skipped"):
                        journal.log_skip(ticker, "Manually skipped from dashboard",
                                         score=score, price=plan.entry)
                        st.success("Skip recorded.")
                with cols[2]:
                    if broker.is_available():
                        if st.button("📤 Send to paper (Alpaca bracket)",
                                     disabled=not check.allowed):
                            try:
                                summary = broker.send_paper_bracket(
                                    ticker, plan.shares, plan.stop, plan.target, score=score
                                )
                                journal.log_entry(
                                    ticker, plan.entry, plan.shares, plan.stop, plan.target,
                                    score=score, notes=f"alpaca paper {summary['order_id']}",
                                )
                                st.success(f"Paper bracket sent: {summary['order_id']}")
                            except broker.BrokerError as exc:
                                st.error(str(exc))
                    else:
                        st.caption("Alpaca paper keys not configured — "
                                   "'Send to paper' disabled.")


# ------------------------------------------------------------- tab 3: live watchlist

with tab_watch:
    c1, c2 = st.columns([3, 1])
    with c1:
        new_ticker = st.text_input("Add ticker to watchlist", value="", key="wl_add")
    with c2:
        st.write("")
        if st.button("Add") and new_ticker.strip():
            db.add_to_watchlist(new_ticker)
            st.cache_resource.clear()  # re-key the provider with the new list
            st.rerun()
    remove = st.multiselect("Remove tickers", watchlist, key="wl_remove")
    if remove and st.button("Remove selected"):
        for t in remove:
            db.remove_from_watchlist(t)
        st.cache_resource.clear()
        st.rerun()

    @st.fragment(run_every="10s")
    def watchlist_table() -> None:
        saved = db.get_all_signal_state()
        rows = []
        for t in watchlist:
            try:
                hist = cached_history(t, "2y")
            except Exception:
                continue
            if len(hist) < 210:
                continue
            scored = sig.compute_scores(hist)
            last = scored.iloc[-1]
            price, source = best_price(t, provider)
            prev_close = float(hist["close"].iloc[-2]) if len(hist) >= 2 else np.nan
            day_pct = (price / prev_close - 1.0) * 100 if price and prev_close else np.nan
            signal_now = str(last["signal"])
            was = saved.get(t, {}).get("signal")
            flipped = was is not None and was != signal_now
            rows.append({
                "Ticker": t,
                "Price": price,
                "Src": "🟢" if source == "LIVE" else "🟡",
                "Day %": day_pct,
                "Signal": f"{'🔁 ' if flipped else ''}{signal_now}"
                          + (f" (was {was})" if flipped else ""),
                "Score": float(last["score"]),
            })
        if rows:
            frame = pd.DataFrame(rows).set_index("Ticker")
            st.dataframe(
                frame.style.format({"Price": "${:,.2f}", "Day %": "{:+.2f}%",
                                    "Score": "{:.0f}"})
                .map(lambda v: "color: #dc2626" if isinstance(v, str) and "🔁" in v else "",
                     subset=["Signal"]),
                use_container_width=True,
            )
            st.caption(f"Source: {provider.label}. "
                       "🔁 = signal differs from last saved alert state.")
        else:
            st.info("No scoreable tickers on the watchlist yet.")

    watchlist_table()


# --------------------------------------------------------- tab 4: journal & positions

with tab_journal:
    st.subheader("Open positions")
    open_pos = db.get_open_positions()
    if open_pos:
        tickers_open = [p["ticker"] for p in open_pos]
        prices_now = {}
        for t in tickers_open:
            price, _ = best_price(t, provider)
            prices_now[t] = price
        view = journal.open_positions_view(prices_now)
        show = view.copy()
        earnings_badges = []
        for t in show["ticker"]:
            edate = cached_earnings(t)
            earnings_badges.append(
                f"⚠ {edate:%b %d}" if edate and risk.earnings_warning(edate) else ""
            )
        show["earnings"] = earnings_badges
        st.dataframe(
            show[["ticker", "sector", "entry", "shares", "stop", "target",
                  "price", "pnl", "pnl_pct", "r_multiple", "earnings"]]
            .style.format({"entry": "${:,.2f}", "stop": "${:,.2f}", "target": "${:,.2f}",
                           "price": "${:,.2f}", "pnl": "${:+,.0f}", "pnl_pct": "{:+.1%}",
                           "r_multiple": "{:+.2f}R"}, na_rep="—"),
            use_container_width=True, hide_index=True,
        )
        with st.form("close_position"):
            cols = st.columns([2, 2, 1])
            pos_label = {f"#{p['id']} {p['ticker']} @ ${p['entry_price']:,.2f}": p["id"]
                         for p in open_pos}
            chosen = cols[0].selectbox("Close position", list(pos_label))
            exit_price = cols[1].number_input("Exit price", min_value=0.01,
                                              value=float(prices_now.get(
                                                  chosen.split()[1], 100.0) or 100.0))
            if cols[2].form_submit_button("Close"):
                journal.log_exit(pos_label[chosen], exit_price, reason="manual close")
                st.rerun()
    else:
        st.caption("No open positions. Log entries from the Stock View tab.")

    st.subheader("Stats")
    s = journal.stats()
    if s["trades"]:
        c = st.columns(5)
        c[0].metric("Closed trades", s["trades"])
        c[1].metric("Win rate", f"{s['win_rate'] * 100:.0f}%")
        c[2].metric("Avg R", f"{s['avg_r']:+.2f}" if not np.isnan(s["avg_r"]) else "—")
        c[3].metric("Expectancy", f"{s['expectancy_r']:+.2f}R")
        c[4].metric("Total P&L", f"${s['total_pnl']:+,.0f}")

        monthly = journal.monthly_pnl()
        if not monthly.empty:
            st.bar_chart(monthly.set_index("month")["pnl"])

        spy_hist = cached_history("SPY", "5y")
        curve = journal.equity_curve(account_size, spy_hist)
        if not curve.empty:
            fig = go.Figure()
            fig.add_trace(go.Scatter(x=curve["date"], y=curve["equity"],
                                     name="Strategy (realized)"))
            if curve["spy_equity"].notna().any():
                fig.add_trace(go.Scatter(x=curve["date"], y=curve["spy_equity"],
                                         name="SPY (same capital)"))
            fig.update_layout(height=350, margin=dict(l=40, r=40, t=30, b=30),
                              legend=dict(orientation="h"))
            st.plotly_chart(fig, use_container_width=True)
    else:
        st.caption("No closed trades yet — stats appear after your first exit.")

    st.subheader("Journal")
    entries = db.get_journal(limit=200)
    if entries:
        jf = pd.DataFrame(entries)
        st.dataframe(jf[["ts", "ticker", "event", "price", "shares", "score", "details"]],
                     use_container_width=True, hide_index=True)
    else:
        st.caption("Journal is empty.")


st.divider()
st.caption(DISCLAIMER)
