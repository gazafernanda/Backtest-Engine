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

### How "live" it actually is

The free tier is **REST only** — there is no stream to subscribe to. Twelve Data's WebSocket starts
at the Pro plan. So the chart polls, and the question is how fast the daily budget allows.

800 requests a day spread evenly is one every 108 seconds, which feels dead. Instead:

- **15 seconds** while the tab is visible
- **nothing at all** when it is hidden — a chart nobody is reading costs zero
- **120 seconds** past 700 requests, and polling stops at 780, leaving headroom for the alert bot

An hour of actually watching costs about 240 requests. The header shows the day's spend, so the
ceiling is never a surprise. It resets at 00:00 UTC.

The last candle is the one still forming, so it moves between polls. Signals are only ever taken
from closed bars.

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

## Telegram alerts

```bash
npm run bot
```

A local process running the same strategies, pushing new setups to Telegram and following each one
until it hits its target or its stop.

**Setup** — add to `.env`:

1. Message [@BotFather](https://t.me/BotFather), send `/newbot`, follow the prompts. It replies with
   a token.
2. Send any message to your new bot. It cannot message you first.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy
   `result[0].message.chat.id`.

```
TELEGRAM_BOT_TOKEN=123456789:AAH...
TELEGRAM_CHAT_ID=987654321
BOT_ACCOUNT_SIZE=10000     # optional: include a suggested lot size
```

**Try it without a bot first:**

```bash
BOT_DRY_RUN=1 npm run bot   # prints alerts instead of sending them
```

**What arrives:**

```
🟢 LONG XAU/USD · 1min
Liquidity Sweep

Entry  4317.87
SL     4316.62  (12.4 pips)
TP     4320.40  (25.4 pips)
R:R    1 : 2.04
Size   0.80 lot  (risks $99.25 of $10000)

Swept low 4317.60 and reclaimed
2026-09-23 09:21 UTC
```

…then later:

```
✅ TARGET HIT — LONG XAU/USD
+25.4 pips  ·  +2.04R
Held 8 bars
```

**Notes**

- The first run records existing setups without announcing them, so starting the bot does not fire
  off a burst of history. What it has already sent lives in `.bot-state.json` (gitignored), so a
  restart does not repeat itself.
- It polls every 2 minutes by default, sharing the same 800/day budget as the browser app. Running
  both at once doubles the spend — set `BOT_POLL_SECONDS` higher, or close one.
- The token stays in `.env` for the same reason as the API key: in a browser bundle, anyone loading
  the page could post to your chat.

## Next

**Real-time prices.** Twelve Data's WebSocket needs the Pro plan; the free tier is REST only. A
relay such as Centrifugo distributes data but does not produce it, so it only helps once there is a
streaming source to publish from — a paid feed, or a broker bridge.

---

## Caveats

- **Twelve Data is not your broker.** Its prices, spread and session boundaries differ from your
  account's.
- **A signal is a hypothesis.** Slippage during news, requotes and variable spread are not modelled,
  and on M1 gold they are not small.
- The free tier caps at 5000 bars, and this uses 500 — roughly the last 8 hours of M1.
