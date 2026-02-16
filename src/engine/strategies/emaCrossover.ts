import type { Candle, Signal, Strategy, StrategyParam } from '../../types';
import { calculateEMA } from '../indicators/ema';

/**
 * EMA Crossover Strategy
 *
 * Entry LONG: Fast EMA crosses above Slow EMA (golden cross)
 * Exit LONG:  Fast EMA crosses below Slow EMA (death cross)
 */
export class EMACrossoverStrategy implements Strategy {
    name = 'EMA Crossover';
    description = 'Enters long when fast EMA crosses above slow EMA (golden cross), exits on death cross.';

    paramDefs: StrategyParam[] = [
        { key: 'fastPeriod', label: 'Fast EMA Period', default: 50, min: 5, max: 100, step: 5 },
        { key: 'slowPeriod', label: 'Slow EMA Period', default: 200, min: 50, max: 400, step: 10 },
    ];

    private emaFast: number[] = [];
    private emaSlow: number[] = [];

    init(candles: Candle[], params: Record<string, number>): void {
        const closes = candles.map((c) => c.close);
        this.emaFast = calculateEMA(closes, params.fastPeriod ?? 50);
        this.emaSlow = calculateEMA(closes, params.slowPeriod ?? 200);
    }

    evaluate(index: number): Signal | null {
        if (index < 1) return null;

        const prevFast = this.emaFast[index - 1];
        const prevSlow = this.emaSlow[index - 1];
        const currFast = this.emaFast[index];
        const currSlow = this.emaSlow[index];

        if (isNaN(prevFast) || isNaN(prevSlow) || isNaN(currFast) || isNaN(currSlow)) {
            return null;
        }

        // Golden cross: fast crosses above slow
        if (prevFast <= prevSlow && currFast > currSlow) {
            return { type: 'entry', side: 'long', reason: 'Golden Cross (EMA fast > slow)' };
        }

        // Death cross: fast crosses below slow
        if (prevFast >= prevSlow && currFast < currSlow) {
            return { type: 'exit', side: 'long', reason: 'Death Cross (EMA fast < slow)' };
        }

        return null;
    }

    getIndicatorData(): Record<string, number[]> {
        return {
            'EMA Fast': this.emaFast,
            'EMA Slow': this.emaSlow,
        };
    }
}
