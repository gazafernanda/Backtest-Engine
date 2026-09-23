/**
 * Engine smoke test — `npm run smoke`.
 *
 * Checks the things a typechecker cannot: that the pip and lot arithmetic is
 * right, that swing detection stays lookahead-safe, and that every run's equity
 * curve reconciles with the sum of its trades. Runs on generated candles, so it
 * validates the engine's mechanics, never a strategy's edge.
 */
import { runBacktest } from '../src/engine/backtest';
import { XAUUSD, pipValue, lotsForRisk, priceMoveToMoney, toPips } from '../src/engine/instrument';
import { buildStructure } from '../src/engine/priceAction';
import { STRATEGIES } from '../src/engine/strategies';
import type { Candle, BacktestConfig } from '../src/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
    const ok = Math.abs(Number(actual) - Number(expected)) < 1e-6;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
}
function assert(label: string, cond: boolean, detail = '') {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
}

// ── Instrument maths ────────────────────────────────────────
console.log('\n--- instrument ---');
check('1 pip @ 1.00 lot = $10', pipValue(XAUUSD, 1), 10);
check('1 pip @ 0.10 lot = $1', pipValue(XAUUSD, 0.1), 1);
check('$1.50 move = 15 pips', toPips(XAUUSD, 1.5), 15);
check('long 4300->4310 @ 0.5 lot = $500', priceMoveToMoney(XAUUSD, 'long', 4300, 4310, 0.5), 500);
check('short 4300->4310 @ 0.5 lot = -$500', priceMoveToMoney(XAUUSD, 'short', 4300, 4310, 0.5), -500);
// $100 risk over a 20-pip stop → 20 pips * $10/pip/lot = $200/lot → 0.50 lots
check('risk sizing 100/20pips = 0.5 lot', lotsForRisk(XAUUSD, 100, 20), 0.5);
check('sub-minimum size rejected', lotsForRisk(XAUUSD, 1, 500), 0);

// ── Swing detection is lookahead-safe ───────────────────────
console.log('\n--- structure ---');
const spike: Candle[] = [];
for (let i = 0; i < 20; i++) {
    const base = 4300 + (i === 10 ? 5 : 0);
    spike.push({ timestamp: i * 60000, open: base, high: base + 1, low: base - 1, close: base });
}
const struct = buildStructure(spike, 3);
const swingHigh = struct.swings.find((s) => s.type === 'high');
assert('swing high found at the spike', swingHigh?.index === 10, `index=${swingHigh?.index}`);
assert('confirmed only after lookback bars', swingHigh?.confirmedAt === 13, `confirmedAt=${swingHigh?.confirmedAt}`);
assert('not visible before confirmation', !isFinite(struct.lastSwingHigh[12]));
assert('visible at confirmation bar', struct.lastSwingHigh[13] === 4306);

// ── Full run: accounting identity ───────────────────────────
console.log('\n--- backtest run ---');
const candles: Candle[] = [];
let price = 4300;
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
// Weekday UTC start so the session filter lets trades through.
const start = Date.UTC(2026, 8, 21, 8, 0, 0);
for (let i = 0; i < 3000; i++) {
    const drift = Math.sin(i / 120) * 0.8;
    const open = price;
    const close = open + drift + (rand() - 0.5) * 1.2;
    candles.push({
        timestamp: start + i * 60_000,
        open,
        high: Math.max(open, close) + rand() * 0.6,
        low: Math.min(open, close) - rand() * 0.6,
        close,
    });
    price = close;
}

const config: BacktestConfig = {
    initialCapital: 10000,
    sizingMode: 'riskPercent',
    fixedLot: 0.1,
    riskPercent: 1,
    spreadPips: 2,
    commissionPerLot: 3,
    slippagePips: 0.5,
    stopLossPips: 0,
    takeProfitPips: 0,
    breakEvenPips: 0,
    leverage: 100,
    stopOutLevel: 50,
    swapLongPerLot: -5,
    swapShortPerLot: 2,
    sessionFilter: 'all',
};

for (const key of ['breakOfStructure', 'liquiditySweep', 'engulfingPullback', 'pinBarRejection', 'insideBarBreakout']) {
    const r = runBacktest(candles, key, paramsFor(key), config, 'XAU/USD', '1min');
    const sumPnl = r.trades.reduce((s, t) => s + t.pnlAbsolute, 0);
    const finalEquity = r.equityCurve[r.equityCurve.length - 1].equity;

    console.log(
        `\n${r.strategyName}: ${r.metrics.totalTrades} trades, ` +
        `${r.metrics.totalPips.toFixed(1)} pips, net $${r.metrics.totalReturn.toFixed(2)}, ` +
        `win ${r.metrics.winRate.toFixed(1)}%, PF ${r.metrics.profitFactor.toFixed(2)}, ` +
        `maxDD ${r.metrics.maxDrawdownPercent.toFixed(2)}%`,
    );
    assert(`  ${key}: produced trades`, r.metrics.totalTrades > 0);
    check(`  ${key}: equity = capital + sum(pnl)`, finalEquity, 10000 + sumPnl);
    check(`  ${key}: metrics.totalReturn matches`, r.metrics.totalReturn, sumPnl);
    assert(
        `  ${key}: every trade carries a stop (risk sizing)`,
        r.trades.every((t) => t.riskPips > 0),
    );
    assert(
        `  ${key}: MAE <= 0 <= MFE`,
        r.trades.every((t) => t.maePips <= 0.0001 && t.mfePips >= -0.0001),
    );
    // Risk is 1% of equity *at entry*, which compounds, so measure it in the
    // trade's own percent terms rather than against the starting capital.
    const stopped = r.trades.filter((t) => t.exitReason === 'stop-loss');
    assert(
        `  ${key}: stopped-out trades lose ~1R (${stopped.length} of them)`,
        stopped.every((t) => t.rMultiple <= -0.9 && t.rMultiple >= -2.0),
        stopped.length > 0
            ? `worst ${Math.min(...stopped.map((t) => t.rMultiple)).toFixed(2)}R`
            : 'none',
    );
    assert(
        `  ${key}: no stop-out loses more than 2.5% of equity`,
        stopped.every((t) => t.pnlPercent >= -2.5),
    );
    assert(
        `  ${key}: exit never precedes entry`,
        r.trades.every((t) => t.exitTimestamp >= t.entryTimestamp),
    );
}

function paramsFor(key: string): Record<string, number> {
    const out: Record<string, number> = {};
    STRATEGIES[key]().paramDefs.forEach((p) => (out[p.key] = p.default));
    return out;
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
