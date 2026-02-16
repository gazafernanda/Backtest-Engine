/**
 * Relative Strength Index (RSI)
 *
 * Uses Wilder's smoothing method:
 * 1. Calculate price changes
 * 2. Separate gains and losses
 * 3. Smooth with exponential average (Wilder's method)
 * 4. RS = avgGain / avgLoss
 * 5. RSI = 100 - 100 / (1 + RS)
 *
 * Returns NaN for the first `period` values.
 */
export function calculateRSI(closes: number[], period: number = 14): number[] {
    const result: number[] = new Array(closes.length).fill(NaN);

    if (closes.length < period + 1) return result;

    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }

    // Initial average gain/loss (SMA for the first period)
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < period; i++) {
        if (changes[i] >= 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    // First RSI value
    if (avgLoss === 0) {
        result[period] = 100;
    } else {
        const rs = avgGain / avgLoss;
        result[period] = 100 - 100 / (1 + rs);
    }

    // Wilder's smoothing for subsequent values
    for (let i = period; i < changes.length; i++) {
        const gain = changes[i] >= 0 ? changes[i] : 0;
        const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        if (avgLoss === 0) {
            result[i + 1] = 100;
        } else {
            const rs = avgGain / avgLoss;
            result[i + 1] = 100 - 100 / (1 + rs);
        }
    }

    return result;
}
