import type { Candle, Signal, Strategy, StrategyParam } from '../../types';
import { calculateEMA } from '../indicators/ema';
import { calculateRSI } from '../indicators/rsi';

/**
 * RSI Pullback Strategy
 *
 * Entry LONG: RSI drops below oversold threshold while in an uptrend (EMA fast > EMA slow)
 * Exit:       RSI rises above overbought threshold OR trend reverses
 */
export class RSIPullbackStrategy implements Strategy {
    name = 'RSI Pullback';
    description = 'Buys RSI pullbacks in an uptrend (EMA fast > slow). Exits on RSI overbought or trend reversal.';

    paramDefs: StrategyParam[] = [
        { key: 'rsiPeriod', label: 'RSI Period', default: 14, min: 5, max: 30, step: 1 },
        { key: 'oversold', label: 'Oversold Level', default: 40, min: 15, max: 50, step: 5 },
        { key: 'overbought', label: 'Overbought Level', default: 70, min: 60, max: 90, step: 5 },
        { key: 'emaPeriod', label: 'Trend EMA Period', default: 50, min: 10, max: 200, step: 10 },
        { key: 'emaTrendPeriod', label: 'Trend Slow EMA', default: 200, min: 50, max: 400, step: 10 },
    ];

    private rsi: number[] = [];
    private emaFast: number[] = [];
    private emaSlow: number[] = [];
    private params: Record<string, number> = {};

    init(candles: Candle[], params: Record<string, number>): void {
        this.params = params;
        const closes = candles.map((c) => c.close);
        this.rsi = calculateRSI(closes, params.rsiPeriod ?? 14);
        this.emaFast = calculateEMA(closes, params.emaPeriod ?? 50);
        this.emaSlow = calculateEMA(closes, params.emaTrendPeriod ?? 200);
    }

    evaluate(index: number): Signal | null {
        if (index < 1) return null;

        const rsiVal = this.rsi[index];
        const prevRsi = this.rsi[index - 1];
        const emaF = this.emaFast[index];
        const emaS = this.emaSlow[index];

        if (isNaN(rsiVal) || isNaN(prevRsi) || isNaN(emaF) || isNaN(emaS)) {
            return null;
        }

        const oversold = this.params.oversold ?? 40;
        const overbought = this.params.overbought ?? 70;
        const inUptrend = emaF > emaS;

        // Entry: RSI crosses below oversold while in uptrend
        if (inUptrend && prevRsi >= oversold && rsiVal < oversold) {
            return {
                type: 'entry',
                side: 'long',
                reason: `RSI pullback (${rsiVal.toFixed(1)}) in uptrend`,
            };
        }

        // Exit: RSI crosses above overbought OR trend reversal
        if (prevRsi <= overbought && rsiVal > overbought) {
            return {
                type: 'exit',
                side: 'long',
                reason: `RSI overbought (${rsiVal.toFixed(1)})`,
            };
        }

        // Exit on trend reversal
        const prevEmaF = this.emaFast[index - 1];
        const prevEmaS = this.emaSlow[index - 1];
        if (!isNaN(prevEmaF) && !isNaN(prevEmaS) && prevEmaF >= prevEmaS && emaF < emaS) {
            return {
                type: 'exit',
                side: 'long',
                reason: 'Trend reversal (EMA crossover down)',
            };
        }

        return null;
    }

    getIndicatorData(): Record<string, number[]> {
        return {
            RSI: this.rsi,
            'EMA Fast': this.emaFast,
            'EMA Slow': this.emaSlow,
        };
    }
}
