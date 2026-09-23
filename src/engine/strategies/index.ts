import { BreakOfStructureStrategy } from './breakOfStructure';
import { LiquiditySweepStrategy } from './liquiditySweep';
import { EngulfingPullbackStrategy } from './engulfingPullback';
import { PinBarRejectionStrategy } from './pinBarRejection';
import { InsideBarBreakoutStrategy } from './insideBarBreakout';
import type { Strategy } from '../../types';

/**
 * Price action strategies.
 *
 * Every one of these emits an entry signal carrying its own structural stop and
 * target, so the setup's own invalidation level defines the risk rather than an
 * arbitrary pip distance. The engine falls back to the configured fixed stop
 * only when a strategy supplies none.
 */
export const STRATEGIES: Record<string, () => Strategy> = {
    breakOfStructure: () => new BreakOfStructureStrategy(),
    liquiditySweep: () => new LiquiditySweepStrategy(),
    engulfingPullback: () => new EngulfingPullbackStrategy(),
    pinBarRejection: () => new PinBarRejectionStrategy(),
    insideBarBreakout: () => new InsideBarBreakoutStrategy(),
};

export {
    BreakOfStructureStrategy,
    LiquiditySweepStrategy,
    EngulfingPullbackStrategy,
    PinBarRejectionStrategy,
    InsideBarBreakoutStrategy,
};
