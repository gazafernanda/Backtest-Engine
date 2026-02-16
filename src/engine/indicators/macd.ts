import { calculateEMA } from './ema';

/**
 * MACD (Moving Average Convergence Divergence)
 *
 * Default periods: fast=12, slow=26, signal=9
 *
 * macdLine   = EMA(fast) - EMA(slow)
 * signalLine = EMA(signal) of macdLine
 * histogram  = macdLine - signalLine
 */
export interface MACDResult {
    macdLine: number[];
    signalLine: number[];
    histogram: number[];
}

export function calculateMACD(
    closes: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
): MACDResult {
    const emaFast = calculateEMA(closes, fastPeriod);
    const emaSlow = calculateEMA(closes, slowPeriod);

    // MACD line = EMA(fast) - EMA(slow)
    const macdLine: number[] = new Array(closes.length).fill(NaN);
    for (let i = 0; i < closes.length; i++) {
        if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) {
            macdLine[i] = emaFast[i] - emaSlow[i];
        }
    }

    // Signal line = EMA of macdLine (only non-NaN values)
    const validMacd: number[] = [];
    const validMacdIndices: number[] = [];
    for (let i = 0; i < macdLine.length; i++) {
        if (!isNaN(macdLine[i])) {
            validMacd.push(macdLine[i]);
            validMacdIndices.push(i);
        }
    }

    const signalOfValid = calculateEMA(validMacd, signalPeriod);

    const signalLine: number[] = new Array(closes.length).fill(NaN);
    for (let i = 0; i < validMacdIndices.length; i++) {
        signalLine[validMacdIndices[i]] = signalOfValid[i];
    }

    // Histogram = MACD - Signal
    const histogram: number[] = new Array(closes.length).fill(NaN);
    for (let i = 0; i < closes.length; i++) {
        if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
            histogram[i] = macdLine[i] - signalLine[i];
        }
    }

    return { macdLine, signalLine, histogram };
}
