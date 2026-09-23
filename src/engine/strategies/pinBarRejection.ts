import type { Candle, Signal, Strategy, StrategyParam } from '../../types';
import type { InstrumentSpec } from '../instrument';
import {
    buildStructure,
    isBearishPinBar,
    isBullishPinBar,
    range,
    type StructureView,
} from '../priceAction';
import { calculateATR } from '../indicators/atr';

/**
 * Pin Bar Rejection at a swing level.
 *
 * A pin bar in open space is noise. This only takes one whose rejection wick
 * actually reaches a confirmed swing level — the wick has to trade into the
 * level and the body has to close away from it.
 */
export class PinBarRejectionStrategy implements Strategy {
    name = 'Pin Bar Rejection';
    description =
        'Enters on a pin bar whose wick rejects a confirmed swing level. Stop beyond the wick, target at a fixed R multiple.';

    paramDefs: StrategyParam[] = [
        { key: 'swingLookback', label: 'Swing Lookback (bars)', default: 8, min: 3, max: 25, step: 1 },
        { key: 'wickRatio', label: 'Min Wick Fraction', default: 0.6, min: 0.4, max: 0.9, step: 0.05 },
        { key: 'atrPeriod', label: 'ATR Period', default: 14, min: 5, max: 50, step: 1 },
        { key: 'minRangeAtr', label: 'Min Bar Range (× ATR)', default: 0.8, min: 0, max: 3, step: 0.1 },
        { key: 'stopAtrMult', label: 'Stop Buffer (× ATR)', default: 0.3, min: 0, max: 2, step: 0.1 },
        { key: 'riskReward', label: 'Risk : Reward', default: 2, min: 1, max: 5, step: 0.5 },
    ];

    private candles: Candle[] = [];
    private structure!: StructureView;
    private atr: number[] = [];
    private params: Record<string, number> = {};

    init(candles: Candle[], params: Record<string, number>, _spec: InstrumentSpec): void {
        this.candles = candles;
        this.params = params;
        this.structure = buildStructure(candles, Math.round(params.swingLookback ?? 8));
        this.atr = calculateATR(candles, Math.round(params.atrPeriod ?? 14));
    }

    evaluate(index: number): Signal | null {
        const c = this.candles[index];
        const s = this.structure;
        const atr = this.atr[index];
        if (!isFinite(atr)) return null;

        if (range(c) < atr * (this.params.minRangeAtr ?? 0.8)) return null;

        const wickRatio = this.params.wickRatio ?? 0.6;
        const buffer = atr * (this.params.stopAtrMult ?? 0.3);
        const rr = this.params.riskReward ?? 2;

        const swingLow = s.lastSwingLow[index];
        const swingHigh = s.lastSwingHigh[index];

        // Bullish pin whose wick reaches down into the swing low.
        if (isBullishPinBar(this.candles, index, wickRatio) && isFinite(swingLow)) {
            if (c.low <= swingLow && c.close > swingLow) {
                const stopPrice = c.low - buffer;
                const risk = c.close - stopPrice;
                if (risk <= 0) return null;
                return {
                    type: 'entry',
                    side: 'long',
                    reason: `Pin bar rejecting ${swingLow.toFixed(2)}`,
                    stopPrice,
                    targetPrice: c.close + risk * rr,
                };
            }
        }

        // Bearish pin whose wick reaches up into the swing high.
        if (isBearishPinBar(this.candles, index, wickRatio) && isFinite(swingHigh)) {
            if (c.high >= swingHigh && c.close < swingHigh) {
                const stopPrice = c.high + buffer;
                const risk = stopPrice - c.close;
                if (risk <= 0) return null;
                return {
                    type: 'entry',
                    side: 'short',
                    reason: `Pin bar rejecting ${swingHigh.toFixed(2)}`,
                    stopPrice,
                    targetPrice: c.close - risk * rr,
                };
            }
        }

        return null;
    }

    getIndicatorData(): Record<string, number[]> {
        return {
            'Swing High': this.structure.lastSwingHigh,
            'Swing Low': this.structure.lastSwingLow,
            ATR: this.atr,
        };
    }
}
