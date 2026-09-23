import type { Candle } from '../../types';

/**
 * Average True Range (Wilder smoothing).
 *
 * Used for volatility-scaled stops — a fixed pip stop behaves very differently
 * on gold during the Asian session than during a US data release.
 *
 * Returns an array aligned to `candles`; entries before the first full period
 * are NaN so callers can skip them explicitly rather than silently trading on a
 * half-formed average.
 */
export function calculateATR(candles: Candle[], period: number): number[] {
    const out = new Array<number>(candles.length).fill(NaN);
    if (candles.length === 0 || period <= 0) return out;

    const tr = new Array<number>(candles.length).fill(NaN);
    tr[0] = candles[0].high - candles[0].low;

    for (let i = 1; i < candles.length; i++) {
        const prevClose = candles[i - 1].close;
        tr[i] = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - prevClose),
            Math.abs(candles[i].low - prevClose),
        );
    }

    if (candles.length < period) return out;

    // Seed with a simple average of the first `period` true ranges.
    let sum = 0;
    for (let i = 0; i < period; i++) sum += tr[i];
    let atr = sum / period;
    out[period - 1] = atr;

    for (let i = period; i < candles.length; i++) {
        atr = (atr * (period - 1) + tr[i]) / period;
        out[i] = atr;
    }

    return out;
}
