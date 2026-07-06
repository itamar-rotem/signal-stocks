# Trading Room

A local, single-user trading data room for **daily-bar swing trading** with a
live price overlay. Free data sources only, everything runs on your machine,
all state in one SQLite file.

> ⚠️ **Not financial advice.** This is an educational/research tool. The
> signals are mechanical computations on historical data — they are not
> recommendations to buy or sell any security. Markets involve risk of loss.
> Do your own research and consult a licensed professional before trading.

## What's inside

| File | Purpose |
|---|---|
| `dashboard.py` | Streamlit UI: screener, stock view, live watchlist, journal |
| `signals.py` | Indicators (SMA/RSI/MACD/ADX/ATR/OBV) + composite 0-100 score |
| `screener.py` | S&P 500 / custom-universe ranking, sector-neutral mode, movers |
| `risk.py` | Regime filter, earnings filter, position caps, circuit breaker |
| `data.py` | yfinance history (15-min cache), universe, live-price providers |
| `alerts.py` | Telegram signal-flip alerts, 15-min daemon, weekly report |
| `backtest.py` | Hysteresis strategy vs buy & hold, walk-forward validation |
| `journal.py` | Positions, trade journal, win rate / R / expectancy stats |
| `broker.py` | Alpaca **paper-only** bracket-order bridge |
| `db.py` | Thin SQLite data-access layer (`trading.db`) |

## 5-minute setup

```bash
cd trading-room
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # optional — works with zero keys
```

That's it. Zero API keys required: history and screening come from yfinance,
and live prices fall back to 60-second yfinance polling (clearly labeled
**DELAYED ~15min**).

### Optional keys (all free tiers)

| Key | Unlocks |
|---|---|
| `FINNHUB_API_KEY` | Real-time prices via websocket (**LIVE** badge) |
| `ALPACA_API_KEY` + `ALPACA_SECRET_KEY` (paper) | Live IEX stream + "Send to paper" bracket orders |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Signal-flip alerts and the weekly report |

## Launch

```bash
# The dashboard
streamlit run dashboard.py

# One-off alert check (prints to stdout if Telegram is not configured)
python alerts.py

# Alert daemon: checks every 15 min during US market hours (9:30-16:00 ET)
python alerts.py --daemon

# Weekly Sunday report
python alerts.py --weekly

# Backtests (10y daily, hysteresis strategy vs buy & hold)
python backtest.py AAPL NVDA
python backtest.py AAPL NVDA --walkforward

# Tests
python -m pytest tests/ -q
```

### Cron instead of the daemon

Daily post-close check at 23:15 Israel time (US close is 23:00 IST in summer):

```cron
15 23 * * 1-5  cd /path/to/trading-room && .venv/bin/python alerts.py >> alerts.log 2>&1
0  18 * * 0    cd /path/to/trading-room && .venv/bin/python alerts.py --weekly >> alerts.log 2>&1
```

## How the signal works

Composite score 0-100 per stock on daily bars, starting at 50:

- **Trend** — close vs SMA200 (±10), SMA50 vs SMA200 (±8), and an
  ADX14-weighted direction component (up to ±12, scales in from ADX 20 to 40).
- **Momentum** — MACD(12,26,9) histogram sign (±8); RSI14 zones:
  50-70 → +9, ≥70 → +2 (overbought fade), 30-50 → −5, ≤30 → −2.
- **Mean reversion** — more than 12% above SMA50 → −10 (stretched);
  more than 12% below → +6 (washed out).
- **Volume** — OBV 20-day change sign (±7).
- **Volatility regime** — if ATR%/close is in the top 15% of the trailing
  year, conviction is halved toward 50.

**BUY ≥ 65, SELL ≤ 35**, else HOLD. Backtests and alerts use hysteresis
(enter ≥ 60, exit ≤ 45) to avoid whipsaws. Position sizing: stop at
entry − 2×ATR14, target at entry + 3×ATR14, shares = account × risk% ÷
(entry − stop).

## Risk rules (enforced before any new entry)

1. No entries within 5 trading days of earnings (⚠ badge inside 7 calendar days).
2. RISK-OFF regime (SPY < SMA200 or VIX > 30) suppresses new BUY entries.
3. Max 6 open positions, max 2 per GICS sector, max 6% total open account risk.
4. Correlation warning when 90-day return correlation > 0.7 with an open position.
5. Circuit breaker: month P&L ≤ −5% blocks new entries until manually overridden.

## Validation

`backtest.py` compares the hysteresis strategy against buy & hold per ticker
(CAGR, max drawdown, Sharpe, win rate, trades; 0.05% cost per position
change) and prints **"NO EDGE"** when the strategy Sharpe is below buy &
hold. `--walkforward` fits thresholds on the first 60% of history and scores
only the untouched last 40%, warning loudly when the out-of-sample Sharpe is
less than half the in-sample one (a classic overfitting signature).

`--synthetic` runs the same pipeline on a deterministic random walk — useful
offline or for demos; it is clearly labeled and is **not** real market data.

## Hosting it somewhere

**Vercel cannot host this app** — Streamlit needs a persistent Python server
with websockets, and Vercel only runs short-lived serverless functions. Use
one of these instead:

### Streamlit Community Cloud (free, no Dockerfile needed)

1. Go to https://share.streamlit.io → **Create app**
2. Repo `itamar-rotem/signal-stocks`, main file path `trading-room/dashboard.py`
3. Optional: paste `FINNHUB_API_KEY` / `TELEGRAM_*` into Advanced settings → Secrets

Caveat: the container is ephemeral, so `trading.db` (journal/positions) resets
on recycle. Fine for screening and signals; keep the journal local if you care
about it.

### Railway / Render / Fly.io (Docker, persistent disk possible)

A `Dockerfile` is included, plus `railway.json` and `fly.toml`.

- **Railway**: New project → Deploy from GitHub repo → set *Root Directory*
  to `trading-room`. It picks up `railway.json`/Dockerfile automatically.
  Attach a volume mounted at `/data` to persist `trading.db`.
- **Render**: New → Web Service → connect the repo, *Root Directory*
  `trading-room`, runtime Docker. Add a Disk mounted at `/data`.
- **Fly.io**: `cd trading-room && fly volumes create trading_data --size 1 && fly launch`.

Set env vars (`FINNHUB_API_KEY`, `TELEGRAM_*`, `ACCOUNT_SIZE`, …) in the
platform dashboard — never commit `.env`. The alert daemon runs as a second
service from the same image with the command `python alerts.py --daemon`.

If you expose the dashboard publicly, remember it has no authentication —
prefer the platform's access controls or keep the URL private.

## Notes

- yfinance data is unofficial and delayed; expect occasional gaps or schema
  changes. Downloads are cached for 15 minutes (sidebar → Force refresh).
- The Alpaca bridge is hard-coded to `paper=True`; it will never touch a
  live account.
- All persistent state lives in `trading.db` — back it up, or delete it to
  start fresh.

*Not financial advice. Past performance does not predict future results.*
