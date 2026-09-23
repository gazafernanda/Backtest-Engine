import type { Candle, Signal, Strategy, StrategyParam } from '../../types';
import type { InstrumentSpec } from '../instrument';
import {
    buildStructure,
    isBearishEngulfing,
    isBullishEngulfing,
    body,
    type StructureView,
} from '../priceAction';
import { calculateATR } from '../indicators/atr';

/**
 * Engulfing Pullback (trend continuation).
 *
 * Trades with the structure rather than against it: only takes bullish
 * engulfings while the market is printing higher highs and higher lows, and
 * bearish engulfings in the mirror case.
 *
 * The engulfing body must be at least `minBodyAtr` × ATR, which filters out the
 * dozens of technically-valid but meaningless engulfings that appear on M1
 * during quiet hours.
 */
export class EngulfingPullbackStrategy implements Strategy {
    name = 'Engulfing Pullback';
    description =
        'Takes engulfing reversals only in the direction of confirmed structure. Stop beyond the engulfing bar, target at a fixed R multiple.';

    paramDefs: StrategyParam[] = [
        { key: 'swingLookback', label: 'Swing Lookback (bars)', default: 5, min: 2, max: 20, step: 1 },
        { key: 'atrPeriod', label: 'ATR Period', default: 14, min: 5, max: 50, step: 1 },
        { key: 'minBodyAtr', label: 'Min Body Size (× ATR)', default: 0.6, min: 0, max: 3, step: 0.1 },
        { key: 'stopAtrMult', label: 'Stop Buffer (× ATR)', default: 0.3, min: 0, max: 2, step: 0.1 },
        { key: 'riskReward', label: 'Risk : Reward', default: 2, min: 1, max: 5, step: 0.5 },
        { key: 'requireTrend', label: 'Require Trend (1=yes, 0=no)', default: 1, min: 0, max: 1, step: 1 },
    ];

    private candles: Candle[] = [];
    private structure!: StructureView;
    private atr: number[] = [];
    private params: Record<string, number> = {};

    init(candles: Candle[], params: Record<string, number>, _spec: InstrumentSpec): void {
        this.candles = candles;
        this.params = params;
        this.structure = buildStructure(candles, Math.round(params.swingLookback ?? 5));
        this.atr = calculateATR(candles, Math.round(params.atrPeriod ?? 14));
    }

    evaluate(index: number): Signal | null {
        const c = this.candles[index];
        const atr = this.atr[index];
        if (!isFinite(atr) || index < 1) return null;

        const minBody = atr * (this.params.minBodyAtr ?? 0.6);
        const buffer = atr * (this.params.stopAtrMult ?? 0.3);
        const rr = this.params.riskReward ?? 2;
        const needTrend = (this.params.requireTrend ?? 1) >= 1;
        const trend = this.structure.trend[index];

        if (body(c) < minBody) return null;

        if (isBullishEngulfing(this.candles, index) && (!needTrend || trend === 1)) {
            const stopPrice = Math.min(c.low, this.candles[index - 1].low) - buffer;
            const risk = c.close - stopPrice;
            if (risk <= 0) return null;
            return {
                type: 'entry',
                side: 'long',
                reason: needTrend ? 'Bullish engulfing in uptrend' : 'Bullish engulfing',
                stopPrice,
                targetPrice: c.close + risk * rr,
            };
        }

        if (isBearishEngulfing(this.candles, index) && (!needTrend || trend === -1)) {
            const stopPrice = Math.max(c.high, this.candles[index - 1].high) + buffer;
            const risk = stopPrice - c.close;
            if (risk <= 0) return null;
            return {
                type: 'entry',
                side: 'short',
                reason: needTrend ? 'Bearish engulfing in downtrend' : 'Bearish engulfing',
                stopPrice,
                targetPrice: c.close - risk * rr,
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
