import type { Candle, Signal, Strategy, StrategyParam } from '../../types';
import type { InstrumentSpec } from '../instrument';
import { buildStructure, type StructureView } from '../priceAction';
import { calculateATR } from '../indicators/atr';

/**
 * Break of Structure + Retest.
 *
 * Price closing beyond the last confirmed swing signals that the prevailing
 * structure has broken. Rather than chasing the breakout bar, this waits for
 * price to return to the broken level and hold it — the retest that turns old
 * resistance into support.
 *
 * The setup expires if the retest does not arrive within `retestBars`, and is
 * cancelled outright if price closes back through the level.
 */
export class BreakOfStructureStrategy implements Strategy {
    name = 'Break of Structure + Retest';
    description =
        'Waits for a close beyond the last swing, then enters on the pullback that holds the broken level. Stop beyond the origin swing, target at a fixed R multiple.';

    paramDefs: StrategyParam[] = [
        { key: 'swingLookback', label: 'Swing Lookback (bars)', default: 5, min: 2, max: 20, step: 1 },
        { key: 'retestBars', label: 'Retest Window (bars)', default: 10, min: 2, max: 40, step: 1 },
        { key: 'atrPeriod', label: 'ATR Period', default: 14, min: 5, max: 50, step: 1 },
        { key: 'stopAtrMult', label: 'Stop Buffer (× ATR)', default: 0.5, min: 0, max: 3, step: 0.1 },
        { key: 'riskReward', label: 'Risk : Reward', default: 2, min: 1, max: 5, step: 0.5 },
    ];

    private candles: Candle[] = [];
    private structure!: StructureView;
    private atr: number[] = [];
    private params: Record<string, number> = {};

    /** Armed setup awaiting its retest. */
    private pending: {
        side: 'long' | 'short';
        level: number;
        originSwing: number;
        expiresAt: number;
    } | null = null;

    init(candles: Candle[], params: Record<string, number>, _spec: InstrumentSpec): void {
        this.candles = candles;
        this.params = params;
        this.structure = buildStructure(candles, Math.round(params.swingLookback ?? 5));
        this.atr = calculateATR(candles, Math.round(params.atrPeriod ?? 14));
        this.pending = null;
    }

    evaluate(index: number): Signal | null {
        const c = this.candles[index];
        const s = this.structure;
        const atr = this.atr[index];
        if (!isFinite(atr)) return null;

        const buffer = atr * (this.params.stopAtrMult ?? 0.5);
        const rr = this.params.riskReward ?? 2;

        // Does an armed setup trigger, expire, or get invalidated on this bar?
        if (this.pending) {
            if (index > this.pending.expiresAt) {
                this.pending = null;
            } else if (this.pending.side === 'long') {
                if (c.close < this.pending.level) {
                    this.pending = null; // Level lost — the break failed.
                } else if (c.low <= this.pending.level) {
                    const stop = Math.min(this.pending.originSwing, c.low) - buffer;
                    const setup = this.pending;
                    this.pending = null;
                    return this.entry('long', c.close, stop, rr, `BOS retest held ${setup.level.toFixed(2)}`);
                }
            } else {
                if (c.close > this.pending.level) {
                    this.pending = null;
                } else if (c.high >= this.pending.level) {
                    const stop = Math.max(this.pending.originSwing, c.high) + buffer;
                    const setup = this.pending;
                    this.pending = null;
                    return this.entry('short', c.close, stop, rr, `BOS retest rejected ${setup.level.toFixed(2)}`);
                }
            }
        }

        // Arm a new setup on a fresh break.
        if (!this.pending) {
            const retestWindow = Math.round(this.params.retestBars ?? 10);
            if (s.bos[index] === 1 && isFinite(s.lastSwingHigh[index]) && isFinite(s.lastSwingLow[index])) {
                this.pending = {
                    side: 'long',
                    level: s.lastSwingHigh[index],
                    originSwing: s.lastSwingLow[index],
                    expiresAt: index + retestWindow,
                };
            } else if (s.bos[index] === -1 && isFinite(s.lastSwingLow[index]) && isFinite(s.lastSwingHigh[index])) {
                this.pending = {
                    side: 'short',
                    level: s.lastSwingLow[index],
                    originSwing: s.lastSwingHigh[index],
                    expiresAt: index + retestWindow,
                };
            }
        }

        return null;
    }

    private entry(
        side: 'long' | 'short',
        price: number,
        stopPrice: number,
        rr: number,
        reason: string,
    ): Signal | null {
        const risk = Math.abs(price - stopPrice);
        if (risk <= 0) return null;
        const targetPrice = side === 'long' ? price + risk * rr : price - risk * rr;
        return { type: 'entry', side, reason, stopPrice, targetPrice };
    }

    getIndicatorData(): Record<string, number[]> {
        return {
            'Swing High': this.structure.lastSwingHigh,
            'Swing Low': this.structure.lastSwingLow,
            ATR: this.atr,
        };
    }
}
