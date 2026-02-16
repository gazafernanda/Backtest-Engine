/**
 * Exponential Moving Average (EMA)
 *
 * EMA = Close × k + PrevEMA × (1 - k)
 * where k = 2 / (period + 1)
 *
 * First value uses SMA as seed.
 * Returns NaN for indices before enough data exists.
 */
export function calculateEMA(closes: number[], period: number): number[] {
    const result: number[] = new Array(closes.length).fill(NaN);

    if (closes.length < period) return result;

    // Seed with SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += closes[i];
    }
    result[period - 1] = sum / period;

    const k = 2 / (period + 1);

    for (let i = period; i < closes.length; i++) {
        result[i] = closes[i] * k + result[i - 1] * (1 - k);
    }

    return result;
}
