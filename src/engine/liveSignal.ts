import type { Candle } from '../types';
import type { InstrumentSpec } from './instrument';
import { toPips } from './instrument';
import { STRATEGIES } from './strategies';

/**
 * Live signal scan.
 *
 * Runs every price action strategy across the loaded candles and collects the
 * entries that carry a full plan — entry, invalidation and target. Signals
 * without both levels are dropped: a setup you cannot draw a stop for is not
 * something to act on.
 *
 * Only closed bars are considered. The most recent candle from the feed is
 * still forming, so a signal on it could vanish before the bar completes.
 */

export interface LiveSignal {
    id: string;
    strategy: string;
    side: 'long' | 'short';
    reason: string;
    timestamp: number;
    barIndex: number;
    entry: number;
    stop: number;
    target: number;
    riskPips: number;
    rewardPips: number;
    riskReward: number;
}

export function scanSignals(
    candles: Candle[],
    spec: InstrumentSpec,
    limit = 20,
): LiveSignal[] {
    if (candles.length < 30) return [];

    const out: LiveSignal[] = [];
    // The final candle is still open; never signal on it.
    const lastClosed = candles.length - 2;

    for (const [key, factory] of Object.entries(STRATEGIES)) {
        const strategy = factory();
        const params: Record<string, number> = {};
        strategy.paramDefs.forEach((p) => (params[p.key] = p.default));

        try {
            strategy.init(candles, params, spec);
        } catch {
            continue;
        }

        for (let i = 0; i <= lastClosed; i++) {
            const signal = strategy.evaluate(i);
            if (!signal || signal.type !== 'entry') continue;
            if (signal.stopPrice === undefined || signal.targetPrice === undefined) continue;

            const entry = candles[i].close;
            const stop = signal.stopPrice;
            const target = signal.targetPrice;

            const riskPips = Math.abs(toPips(spec, entry - stop));
            const rewardPips = Math.abs(toPips(spec, target - entry));
            if (riskPips <= 0) continue;

            out.push({
                id: `${key}-${i}`,
                strategy: strategy.name,
                side: signal.side,
                reason: signal.reason,
                timestamp: candles[i].timestamp,
                barIndex: i,
                entry,
                stop,
                target,
                riskPips,
                rewardPips,
                riskReward: rewardPips / riskPips,
            });
        }
    }

    // Newest first.
    out.sort((a, b) => b.timestamp - a.timestamp);
    return out.slice(0, limit);
}

export type SignalOutcome = 'open' | 'target hit' | 'stop hit';

/**
 * Walk the bars after a signal to see what happened to it.
 *
 * When a single bar's range covers both levels, the stop is taken — intrabar
 * order is unknowable from OHLC, and the pessimistic reading is the honest one.
 */
export function resolveOutcome(
    signal: LiveSignal,
    candles: Candle[],
): { outcome: SignalOutcome; barsHeld: number } {
    for (let i = signal.barIndex + 1; i < candles.length; i++) {
        const c = candles[i];
        const stopHit = signal.side === 'long' ? c.low <= signal.stop : c.high >= signal.stop;
        if (stopHit) return { outcome: 'stop hit', barsHeld: i - signal.barIndex };

        const targetHit =
            signal.side === 'long' ? c.high >= signal.target : c.low <= signal.target;
        if (targetHit) return { outcome: 'target hit', barsHeld: i - signal.barIndex };
    }
    return { outcome: 'open', barsHeld: candles.length - 1 - signal.barIndex };
}
