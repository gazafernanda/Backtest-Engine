import type { Candle, Signal, Strategy, StrategyParam } from '../../types';
import { calculateEMA } from '../indicators/ema';
import { calculateMACD } from '../indicators/macd';

/**
 * MACD Signal Strategy
 *
 * Entry LONG: MACD histogram crosses from negative to positive (bullish momentum)
 * Exit LONG:  MACD histogram crosses from positive to negative (bearish momentum)
 * Optional:   Filter with EMA trend confirmation
 */
export class MACDSignalStrategy implements Strategy {
    name = 'MACD Signal';
    description = 'Enters on MACD histogram bullish crossover. Optional EMA trend filter.';

    paramDefs: StrategyParam[] = [
        { key: 'fastPeriod', label: 'MACD Fast', default: 12, min: 5, max: 30, step: 1 },
        { key: 'slowPeriod', label: 'MACD Slow', default: 26, min: 15, max: 50, step: 1 },
        { key: 'signalPeriod', label: 'Signal Period', default: 9, min: 3, max: 20, step: 1 },
        { key: 'trendFilter', label: 'Trend EMA (0=off)', default: 200, min: 0, max: 400, step: 10 },
    ];

    private histogram: number[] = [];
    private macdLine: number[] = [];
    private signalLine: number[] = [];
    private trendEma: number[] = [];
    private closes: number[] = [];

    init(candles: Candle[], params: Record<string, number>): void {
        this.closes = candles.map((c) => c.close);
        const { macdLine, signalLine, histogram } = calculateMACD(
            this.closes,
            params.fastPeriod ?? 12,
            params.slowPeriod ?? 26,
            params.signalPeriod ?? 9,
        );
        this.macdLine = macdLine;
        this.signalLine = signalLine;
        this.histogram = histogram;

        const trendPeriod = params.trendFilter ?? 200;
        if (trendPeriod > 0) {
            this.trendEma = calculateEMA(this.closes, trendPeriod);
        } else {
            this.trendEma = new Array(this.closes.length).fill(0); // no filter
        }
    }

    evaluate(index: number): Signal | null {
        if (index < 1) return null;

        const prevHist = this.histogram[index - 1];
        const currHist = this.histogram[index];
        const trendEma = this.trendEma[index];
        const close = this.closes[index];

        if (isNaN(prevHist) || isNaN(currHist)) return null;

        const trendOk = isNaN(trendEma) || trendEma === 0 || close > trendEma;

        // Bullish crossover: histogram goes from negative to positive
        if (prevHist <= 0 && currHist > 0 && trendOk) {
            return {
                type: 'entry',
                side: 'long',
                reason: 'MACD histogram bullish crossover',
            };
        }

        // Bearish crossover: histogram goes from positive to negative
        if (prevHist >= 0 && currHist < 0) {
            return {
                type: 'exit',
                side: 'long',
                reason: 'MACD histogram bearish crossover',
            };
        }

        return null;
    }

    getIndicatorData(): Record<string, number[]> {
        return {
            'MACD Line': this.macdLine,
            'Signal Line': this.signalLine,
            Histogram: this.histogram,
            ...(this.trendEma.some((v) => v !== 0) ? { 'Trend EMA': this.trendEma } : {}),
        };
    }
}
