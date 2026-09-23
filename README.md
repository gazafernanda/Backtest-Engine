# XAU/USD Live Signal Monitor

An M1 gold chart that watches itself. Price action strategies run continuously over the latest
candles, and the current setup is drawn on the chart as three lines: **entry**, **stop loss**,
**take profit**.

There is nothing to configure and nothing to click.

---

## Running it

```bash
npm install
npm run dev
```

The key lives in `.env` (copy `.env.example`), so the app starts and runs with no input:

```
VITE_TWELVEDATA_API_KEY=your_key_here
```

A free key comes from <https://twelvedata.com/apikey>.

### Why it runs locally rather than on the web

A `VITE_` variable is inlined into the JavaScript bundle. A public build carrying your key hands
that key to everyone who loads the page, and your quota is theirs. So the
[Pages deploy](https://gazafernanda.github.io/Backtest-Engine/) ships without one and runs on
generated prices — useful as a demo of the interface, not as a signal source.

The same constraint will apply to a Telegram bot token. See *Next* below.

### Polling budget

One request every **2 minutes** — 720 a day against the free tier's 800. Polling every minute would
exhaust the quota partway through the day.

---

## What you see

- **Chart** — M1 candles, auto-refreshing, with entry/SL/TP as labelled price lines and an arrow on
  the signal bar. Panning and zooming survive refreshes.
- **Setup card** — side, which strategy fired, the three levels, pip distances and R:R, plus whether
  the trade has since hit its target, its stop, or is still open.
- **Earlier signals** — the last 20, each resolved the same way.

Signals only ever come from **closed** bars. The newest candle from the feed is still forming, and a
setup on it can vanish before the bar completes.

---

## The strategies

Five, all running at once. Whichever fired most recently is the one on the chart.

| Strategy | Idea |
|---|---|
| **Break of Structure + Retest** | Close beyond the last swing, then the pullback that holds the broken level. |
| **Liquidity Sweep** | A spike through a swing that closes back inside it — the stop-hunt signature. |
| **Engulfing Pullback** | Engulfing bars, but only with confirmed structure and a body large relative to ATR. |
| **Pin Bar Rejection** | A pin bar whose wick actually reaches a swing level and whose body closes away from it. |
| **Inside Bar Breakout** | Break of the mother bar after a compression. The coil defines the stop. |

Each supplies its own stop and target, so the risk comes from what invalidates the setup rather
than a fixed pip distance.

Swings carry a **confirmation delay** — a swing high is only visible some bars after it forms, which
is when it could actually have been known. Detecting swings with a centred window instead produces
signals that look excellent in review and cannot be taken live.

---

## Verifying it

```bash
npm run smoke
```

Checks the pip and lot arithmetic, the swing confirmation delay, that signals never land on the
open bar and always sit on the correct side of their levels, that the backtest engine's equity
reconciles with its trades — and that the app renders. That last one exists because a blank page
typechecks and builds perfectly well.

```bash
npm run build      # typecheck + production bundle
```

---

## Layout

```
src/
  engine/
    liveSignal.ts       Scan all strategies, resolve outcomes
    priceAction.ts      Swings, market structure, candle patterns, sessions
    strategies/         The five setups
    instrument.ts       Gold contract spec, pip/lot/margin arithmetic
    backtest.ts         Full simulation (costs, swap, margin) - kept for testing
    metrics.ts          Performance statistics
    autoConfig.ts       Derives sizing/costs from account size and risk appetite
    indicators/atr.ts   ATR (Wilder)
  components/
    LiveMonitor.tsx     Polling loop and layout
    SignalChart.tsx     Candles + entry/SL/TP lines
  data/twelvedata.ts    Market data, cache, synthetic fallback
scripts/smoketest.ts    Self-checks
```

The backtesting engine is no longer wired to the UI but is kept and still tested — it is what
established that these strategies behave sanely, and it is where position sizing will come from when
alerts start carrying a lot size.

---

## Next

**Telegram alerts.** The bot token has the same exposure problem as the API key, so it cannot live
in a browser bundle. It needs a small local process — a script that polls, detects a new signal and
calls the Telegram API — which can share the `engine/` code directly.

---

## Caveats

- **Twelve Data is not your broker.** Its prices, spread and session boundaries differ from your
  account's.
- **A signal is a hypothesis.** Slippage during news, requotes and variable spread are not modelled,
  and on M1 gold they are not small.
- The free tier caps at 5000 bars, and this uses 500 — roughly the last 8 hours of M1.
