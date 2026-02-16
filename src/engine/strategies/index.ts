import { EMACrossoverStrategy } from './emaCrossover';
import { RSIPullbackStrategy } from './rsiPullback';
import { MACDSignalStrategy } from './macdSignal';
import type { Strategy } from '../../types';

export const STRATEGIES: Record<string, () => Strategy & { getIndicatorData(): Record<string, number[]> }> = {
    emaCrossover: () => new EMACrossoverStrategy(),
    rsiPullback: () => new RSIPullbackStrategy(),
    macdSignal: () => new MACDSignalStrategy(),
};

export { EMACrossoverStrategy, RSIPullbackStrategy, MACDSignalStrategy };
