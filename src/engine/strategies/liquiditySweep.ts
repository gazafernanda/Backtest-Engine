import type { Candle, Signal, Strategy, StrategyParam } from '../../types';
import type { InstrumentSpec } from '../instrument';
import {
    buildStructure,
    sweptHighAndRejected,
    sweptLowAndReclaimed,
    type StructureView,
} from '../priceAction';
import { calculateATR } from '../indicators/atr';

/**
 * Liquidity Sweep (stop hunt reversal).
 *
 * Resting stops cluster just beyond obvious swing highs and lows. A bar that
 * spikes through one of those levels and then closes back inside the range has
 * taken that liquidity without acceptance — often the last move before a
 * reversal.
 *
 * The sweep must clear the level by at least `minSweepAtr` × ATR, otherwise
 * every bar that grazes a swing by one tick would qualify.
 */
export class LiquiditySweepStrategy implements Strategy {
    name = 'Liquidity Sweep';
    description =
        'Enters against a spike that pierces a swing level and closes back inside it. Stop beyond the sweep wick, target at the opposite swing.';

    paramDefs: StrategyParam[] = [
        { key: 'swingLookback', label: 'Swing Lookback (bars)', default: 8, min: 3, max: 25, step: 1 },
        { key: 'atrPeriod', label: 'ATR Period', default: 14, min: 5, max: 50, step: 1 },
        { key: 'minSweepAtr', label: 'Min Sweep Depth (× ATR)', default: 0.2, min: 0, max: 2, step: 0.1 },
        { key: 'stopAtrMult', label: 'Stop Buffer (× ATR)', default: 0.3, min: 0, max: 2, step: 0.1 },
        { key: 'riskReward', label: 'Fallback Risk : Reward', default: 2, min: 1, max: 5, step: 0.5 },
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

        const minDepth = atr * (this.params.minSweepAtr ?? 0.2);
        const buffer = atr * (this.params.stopAtrMult ?? 0.3);
        const rr = this.params.riskReward ?? 2;

        const swingLow = s.lastSwingLow[index];
        const swingHigh = s.lastSwingHigh[index];

        if (isFinite(swingLow) && sweptLowAndReclaimed(this.candles, index, swingLow)) {
            if (swingLow - c.low < minDepth) return null;
            const stopPrice = c.low - buffer;
            const risk = c.close - stopPrice;
            if (risk <= 0) return null;
            // Prefer the opposite swing as the target; fall back to a fixed R.
            const target =
                isFinite(swingHigh) && swingHigh > c.close ? swingHigh : c.close + risk * rr;
            return {
                type: 'entry',
                side: 'long',
                reason: `Swept low ${swingLow.toFixed(2)} and reclaimed`,
                stopPrice,
                targetPrice: target,
            };
        }

        if (isFinite(swingHigh) && sweptHighAndRejected(this.candles, index, swingHigh)) {
            if (c.high - swingHigh < minDepth) return null;
            const stopPrice = c.high + buffer;
            const risk = stopPrice - c.close;
            if (risk <= 0) return null;
            const target = isFinite(swingLow) && swingLow < c.close ? swingLow : c.close - risk * rr;
            return {
                type: 'entry',
                side: 'short',
                reason: `Swept high ${swingHigh.toFixed(2)} and rejected`,
                stopPrice,
                targetPrice: target,
            };
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
