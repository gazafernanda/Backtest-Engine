import type { Candle } from '../types';

/**
 * Price action toolkit — swings, market structure and candle patterns.
 *
 * Every helper here is lookahead-safe. A swing high at bar `i` is only *knowable*
 * once `lookback` bars have printed to its right, so each swing carries a
 * `confirmedAt` index and the per-bar views below never expose a swing before
 * that bar. Getting this wrong is the single most common way a price action
 * backtest produces results that cannot be reproduced live.
 */

export type SwingType = 'high' | 'low';

export interface SwingPoint {
    index: number;
    price: number;
    type: SwingType;
    /** First bar index at which this swing was confirmed. */
    confirmedAt: number;
}

/**
 * Fractal swings: bar `i` is a swing high when its high is the highest across
 * `[i-lookback, i+lookback]`. Ties are rejected so flat ranges do not emit a
 * swing on every bar.
 */
export function findSwings(candles: Candle[], lookback: number): SwingPoint[] {
    const swings: SwingPoint[] = [];
    if (lookback < 1) return swings;

    for (let i = lookback; i < candles.length - lookback; i++) {
        let isHigh = true;
        let isLow = true;

        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j === i) continue;
            if (candles[j].high >= candles[i].high) isHigh = false;
            if (candles[j].low <= candles[i].low) isLow = false;
            if (!isHigh && !isLow) break;
        }

        if (isHigh) {
            swings.push({ index: i, price: candles[i].high, type: 'high', confirmedAt: i + lookback });
        } else if (isLow) {
            swings.push({ index: i, price: candles[i].low, type: 'low', confirmedAt: i + lookback });
        }
    }

    return swings;
}

export type Trend = 1 | 0 | -1;

/**
 * Per-bar view of market structure, all arrays aligned to `candles`.
 *
 * `lastSwingHigh[i]` is the most recent swing high *confirmed on or before* bar
 * `i` — NaN until one exists.
 */
export interface StructureView {
    swings: SwingPoint[];
    lastSwingHigh: number[];
    lastSwingLow: number[];
    prevSwingHigh: number[];
    prevSwingLow: number[];
    /** Bar index of the most recent confirmed swing high / low. -1 when none. */
    lastSwingHighIndex: number[];
    lastSwingLowIndex: number[];
    /**
     * 1 = higher highs and higher lows, -1 = lower highs and lower lows,
     * 0 = mixed or not enough structure yet.
     */
    trend: Trend[];
    /**
     * Break of structure on this bar's close: 1 = closed above the last swing
     * high, -1 = closed below the last swing low, 0 = neither.
     */
    bos: (1 | 0 | -1)[];
}

export function buildStructure(candles: Candle[], lookback: number): StructureView {
    const n = candles.length;
    const swings = findSwings(candles, lookback);

    const lastSwingHigh = new Array<number>(n).fill(NaN);
    const lastSwingLow = new Array<number>(n).fill(NaN);
    const prevSwingHigh = new Array<number>(n).fill(NaN);
    const prevSwingLow = new Array<number>(n).fill(NaN);
    const lastSwingHighIndex = new Array<number>(n).fill(-1);
    const lastSwingLowIndex = new Array<number>(n).fill(-1);
    const trend = new Array<Trend>(n).fill(0);
    const bos = new Array<1 | 0 | -1>(n).fill(0);

    // Walk bars forward, releasing each swing only at its confirmation bar.
    let cursor = 0;
    const highs: SwingPoint[] = [];
    const lows: SwingPoint[] = [];
    const byConfirmation = [...swings].sort((a, b) => a.confirmedAt - b.confirmedAt);

    for (let i = 0; i < n; i++) {
        while (cursor < byConfirmation.length && byConfirmation[cursor].confirmedAt <= i) {
            const s = byConfirmation[cursor];
            if (s.type === 'high') highs.push(s);
            else lows.push(s);
            cursor++;
        }

        const h1 = highs[highs.length - 1];
        const h2 = highs[highs.length - 2];
        const l1 = lows[lows.length - 1];
        const l2 = lows[lows.length - 2];

        if (h1) {
            lastSwingHigh[i] = h1.price;
            lastSwingHighIndex[i] = h1.index;
        }
        if (h2) prevSwingHigh[i] = h2.price;
        if (l1) {
            lastSwingLow[i] = l1.price;
            lastSwingLowIndex[i] = l1.index;
        }
        if (l2) prevSwingLow[i] = l2.price;

        if (h1 && h2 && l1 && l2) {
            const higherHighs = h1.price > h2.price;
            const higherLows = l1.price > l2.price;
            const lowerHighs = h1.price < h2.price;
            const lowerLows = l1.price < l2.price;
            if (higherHighs && higherLows) trend[i] = 1;
            else if (lowerHighs && lowerLows) trend[i] = -1;
        }

        if (h1 && candles[i].close > h1.price) bos[i] = 1;
        else if (l1 && candles[i].close < l1.price) bos[i] = -1;
    }

    return {
        swings,
        lastSwingHigh,
        lastSwingLow,
        prevSwingHigh,
        prevSwingLow,
        lastSwingHighIndex,
        lastSwingLowIndex,
        trend,
        bos,
    };
}

// ─── Candle anatomy ──────────────────────────────────────────

export function body(c: Candle): number {
    return Math.abs(c.close - c.open);
}

export function range(c: Candle): number {
    return c.high - c.low;
}

export function upperWick(c: Candle): number {
    return c.high - Math.max(c.open, c.close);
}

export function lowerWick(c: Candle): number {
    return Math.min(c.open, c.close) - c.low;
}

export function isBullish(c: Candle): boolean {
    return c.close > c.open;
}

export function isBearish(c: Candle): boolean {
    return c.close < c.open;
}

// ─── Patterns ────────────────────────────────────────────────

/** Current body fully engulfs the previous body, in the opposite direction. */
export function isBullishEngulfing(candles: Candle[], i: number): boolean {
    if (i < 1) return false;
    const prev = candles[i - 1];
    const curr = candles[i];
    return (
        isBearish(prev) &&
        isBullish(curr) &&
        curr.close > prev.open &&
        curr.open <= prev.close &&
        body(curr) > body(prev)
    );
}

export function isBearishEngulfing(candles: Candle[], i: number): boolean {
    if (i < 1) return false;
    const prev = candles[i - 1];
    const curr = candles[i];
    return (
        isBullish(prev) &&
        isBearish(curr) &&
        curr.close < prev.open &&
        curr.open >= prev.close &&
        body(curr) > body(prev)
    );
}

/**
 * Pin bar / hammer: a long rejection wick on one side, a small body, and little
 * wick on the other. `wickRatio` is the minimum wick-to-range fraction.
 */
export function isBullishPinBar(candles: Candle[], i: number, wickRatio: number): boolean {
    const c = candles[i];
    const r = range(c);
    if (r <= 0) return false;
    return lowerWick(c) / r >= wickRatio && body(c) / r <= 1 - wickRatio && upperWick(c) / r <= 0.25;
}

export function isBearishPinBar(candles: Candle[], i: number, wickRatio: number): boolean {
    const c = candles[i];
    const r = range(c);
    if (r <= 0) return false;
    return upperWick(c) / r >= wickRatio && body(c) / r <= 1 - wickRatio && lowerWick(c) / r <= 0.25;
}

/** Current bar's whole range sits inside the previous bar's range. */
export function isInsideBar(candles: Candle[], i: number): boolean {
    if (i < 1) return false;
    return candles[i].high <= candles[i - 1].high && candles[i].low >= candles[i - 1].low;
}

/**
 * Liquidity sweep: price traded through a prior level but closed back on the
 * original side — the classic stop-hunt signature.
 */
export function sweptLowAndReclaimed(candles: Candle[], i: number, level: number): boolean {
    return candles[i].low < level && candles[i].close > level;
}

export function sweptHighAndRejected(candles: Candle[], i: number, level: number): boolean {
    return candles[i].high > level && candles[i].close < level;
}

// ─── Sessions ────────────────────────────────────────────────

/**
 * Trading sessions in UTC hours, as [startInclusive, endExclusive).
 * Gold's liquidity profile differs sharply between them, so entry filtering by
 * session usually matters more than any parameter tweak.
 */
export const SESSION_HOURS_UTC: Record<string, [number, number] | null> = {
    all: null,
    asia: [0, 8],
    london: [7, 16],
    newYork: [12, 21],
    londonNewYork: [7, 21],
};

export function isInSession(timestamp: number, session: string): boolean {
    const window = SESSION_HOURS_UTC[session];
    if (!window) return true;

    const d = new Date(timestamp);
    const day = d.getUTCDay();
    // The market is shut from Friday 21:00 UTC to Sunday 22:00 UTC.
    if (day === 6) return false;
    if (day === 0 && d.getUTCHours() < 22) return false;
    if (day === 5 && d.getUTCHours() >= 21) return false;

    const hour = d.getUTCHours();
    const [start, end] = window;
    return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}
