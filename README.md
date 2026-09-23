# Gold Backtesting Engine

Price action backtesting for **XAU/USD**, in the browser. React + Vite + TypeScript, no backend.

Originally a crypto backtester built on CoinGecko and indicator crossovers; rebuilt around spot
gold, lot/pip accounting and price action structure.

---

**Live:** <https://gazafernanda.github.io/Backtest-Engine/>

## Quick start

```bash
npm install
npm run dev
```

Then paste a free Twelve Data key (800 requests/day, from
<https://twelvedata.com/apikey>) into the sidebar. It is kept in your browser's localStorage and
goes nowhere else.

For a local-only setup you can instead copy `.env.example` to `.env` and set
`VITE_TWELVEDATA_API_KEY`. The sidebar key wins when both are present.

> **Do not put a key in the deployed build.** Anything passed as a `VITE_` variable is inlined into
> the JavaScript bundle and readable by anyone who loads the page. The Pages deploy ships with no
> key on purpose; each visitor supplies their own.

Without a key the app still runs, but on **generated** prices. Those runs are labelled with an
orange banner and flagged as `isSyntheticData` — they demonstrate the engine, they are not results.

```bash
npm run build    # typecheck + production bundle
npm run smoke    # engine self-checks (pip maths, lookahead safety, equity reconciliation)
```

## Deployment

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. The smoke test gates the deploy — if the engine's arithmetic or
lookahead guarantees break, nothing ships.

One-time setup in the repo: **Settings → Pages → Source: GitHub Actions**.

The build sets Vite's `base` to `/Backtest-Engine/`, since Pages serves project sites from a
subpath. Rename the repo and that value has to change with it.

---

## What the engine models

Gold is not traded as a fraction of your account — it is traded in lots, with a spread, financing
and a margin call. All of that is simulated.

| | |
|---|---|
| Contract size | 100 oz per 1.00 lot |
| Pip | 0.10 of price — **$10 per pip per 1.00 lot** |
| Lots | 0.01 minimum, 0.01 step |
| Costs | Spread (pips), commission ($/lot/side), slippage (pips) |
| Sizing | Fixed lot, or % of equity risked per trade |
| Leverage | Configurable, with a stop-out level that force-closes positions |
| Financing | Swap per lot per night, charged at 22:00 UTC, tripled on Wednesday |
| Sessions | Entries can be restricted to Asia / London / New York / overlap |

### Execution assumptions

These decide the results, so they are stated rather than buried:

1. Candle prices are treated as **mid**. Half the spread plus slippage is applied adversely to every
   fill, so a round trip pays one full spread whichever way it is taken.
2. Signals are evaluated on a **closed** bar and fill at that bar's close. A position opened on bar
   *i* is first managed on bar *i+1*. No lookahead.
3. When a bar's range contains both the stop and the target, **the stop is taken**. Intrabar order
   is unknowable from OHLC, and the pessimistic reading is the honest one.
4. Break-even stop moves are applied on the bar close and bind from the next bar, for the same
   reason.
5. Swing highs and lows are only visible `lookback` bars after they form — the bar at which they
   could actually have been known.

Point 5 matters more than it sounds. A swing detected with a centred window is trivially profitable
to trade in a backtest and impossible to trade live. `npm run smoke` asserts the confirmation delay
explicitly.

---

## Strategies

All five emit their own **structural stop and target**, so risk is defined by what invalidates the
setup rather than an arbitrary pip distance. The fixed stop/target in the config is only a fallback,
used when a strategy supplies none.

| Strategy | Idea |
|---|---|
| **Break of Structure + Retest** | Close beyond the last swing, then enter on the pullback that holds the broken level. Expires if the retest never arrives. |
| **Liquidity Sweep** | A spike through a swing that closes back inside it — the stop-hunt signature. Must clear the level by a minimum ATR fraction. |
| **Engulfing Pullback** | Engulfing bars, but only in the direction of confirmed structure, and only when the body is large relative to ATR. |
| **Pin Bar Rejection** | A pin bar whose wick actually reaches a confirmed swing level and whose body closes away from it. |
| **Inside Bar Breakout** | Break of the mother bar after a compression. The coil defines the stop. |

---

## Metrics

Beyond the usual return/win-rate/profit-factor/drawdown set:

- **Net pips** and **R multiple** per trade — the two numbers that survive a change in account size
- **MAE / MFE** per trade, in pips: how far each trade went against you before it worked, and how
  much of the favourable move you gave back
- **Expectancy** in both dollars and R
- **Longest losing streak** — usually the number that decides whether a system is actually tradable
- Total commission, total swap, and any margin stop-outs

Sharpe is annualised from the **bar duration**, using a 24×5 trading week. Annualising M1 returns
with a 365-day factor, as the original crypto engine did, overstates it by more than an order of
magnitude.

---

## Layout

```
src/
  engine/
    instrument.ts       Contract spec and all pip/lot/margin arithmetic
    backtest.ts         Simulation loop: fills, stops, swap, margin, sizing
    metrics.ts          Performance statistics
    priceAction.ts      Swings, market structure, candle patterns, sessions
    indicators/atr.ts   ATR (Wilder) for volatility-scaled stops
    strategies/         The five price action strategies
  data/twelvedata.ts    Market data + localStorage cache + synthetic fallback
  components/           Dashboard, charts, config panel
  context/              App state
scripts/smoketest.ts    Engine self-checks
```

To add a strategy: implement `Strategy` from `src/types`, register it in
`src/engine/strategies/index.ts`. The config panel builds its controls from `paramDefs`
automatically.

---

## Caveats worth keeping in mind

- **The free data tier caps at 5000 bars per request.** On M1 that is about 3.5 trading days — fine
  for examining a setup's behaviour, far too short to judge an edge. Use higher timeframes, or a
  broker CSV export, for anything conclusive.
- **Twelve Data is not your broker.** Its spread, session boundaries and weekend gaps will differ
  from your account's. Treat the cost settings as something to calibrate against your own fills.
- **A backtest is a hypothesis, not a forecast.** Slippage during news, requotes, and variable
  spread are not modelled here, and on M1 gold they are not small.
- The API key is inlined into the client bundle, which is fine for a local tool. Proxy it through a
  backend before deploying this anywhere public.
