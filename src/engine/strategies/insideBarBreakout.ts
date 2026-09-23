import type { Candle, Signal, Strategy, StrategyParam } from '../../types';
import type { InstrumentSpec } from '../instrument';
import { buildStructure, isInsideBar, range, type StructureView } from '../priceAction';
import { calculateATR } from '../indicators/atr';

/**
 * Inside Bar Breakout (volatility compression).
 *
 * One or more bars coiling entirely inside a mother bar marks a pause. The
 * break of the mother bar's extreme is the release. The stop sits on the far
 * side of the mother bar, so the compression itself defines the risk — tighter
 * coils give tighter stops, which is the whole appeal of the pattern.
 */
export class InsideBarBreakoutStrategy implements Strategy {
    name = 'Inside Bar Breakout';
    description =
        'Enters when price breaks out of a mother bar after one or more inside bars. Stop at the opposite end of the mother bar, target at a fixed R multiple.';

    paramDefs: StrategyParam[] = [
        { key: 'swingLookback', label: 'Swing Lookback (bars)', default: 5, min: 2, max: 20, step: 1 },
        { key: 'atrPeriod', label: 'ATR Period', default: 14, min: 5, max: 50, step: 1 },
        { key: 'maxMotherAtr', label: 'Max Mother Bar (× ATR)', default: 2, min: 0.5, max: 5, step: 0.25 },
        { key: 'breakoutBuffer', label: 'Breakout Buffer (× ATR)', default: 0.1, min: 0, max: 1, step: 0.05 },
        { key: 'riskReward', label: 'Risk : Reward', default: 2, min: 1, max: 5, step: 0.5 },
        { key: 'requireTrend', label: 'Require Trend (1=yes, 0=no)', default: 0, min: 0, max: 1, step: 1 },
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
        if (index < 2) return null;
        const c = this.candles[index];
        const atr = this.atr[index];
        if (!isFinite(atr)) return null;

        // The previous bar must be inside; walk back to find its mother bar.
        if (!isInsideBar(this.candles, index - 1)) return null;
        let motherIdx = index - 2;
        while (motherIdx > 0 && isInsideBar(this.candles, motherIdx)) motherIdx--;
        const mother = this.candles[motherIdx];

        if (range(mother) > atr * (this.params.maxMotherAtr ?? 2)) return null;

        const buffer = atr * (this.params.breakoutBuffer ?? 0.1);
        const rr = this.params.riskReward ?? 2;
        const needTrend = (this.params.requireTrend ?? 0) >= 1;
        const trend = this.structure.trend[index];

        if (c.close > mother.high + buffer && (!needTrend || trend === 1)) {
            const stopPrice = mother.low;
            const risk = c.close - stopPrice;
            if (risk <= 0) return null;
            return {
                type: 'entry',
                side: 'long',
                reason: `Inside bar breakout above ${mother.high.toFixed(2)}`,
                stopPrice,
                targetPrice: c.close + risk * rr,
            };
        }

        if (c.close < mother.low - buffer && (!needTrend || trend === -1)) {
            const stopPrice = mother.high;
            const risk = stopPrice - c.close;
            if (risk <= 0) return null;
            return {
                type: 'entry',
                side: 'short',
                reason: `Inside bar breakdown below ${mother.low.toFixed(2)}`,
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
