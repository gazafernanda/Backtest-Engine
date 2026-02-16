import type { Candle, Trade, EquityPoint, BacktestConfig, BacktestResult, Strategy } from '../types';
import { calculateMetrics, calculateMonthlyBreakdown } from './metrics';
import { STRATEGIES } from './strategies';

/**
 * Core Backtesting Engine
 *
 * Simulates trading on historical candle data using a given strategy.
 * Handles: position management, slippage, commission, stop-loss, take-profit.
 * No lookahead bias — strategy only sees data up to the current candle.
 */
export function runBacktest(
    candles: Candle[],
    strategyKey: string,
    strategyParams: Record<string, number>,
    config: BacktestConfig,
    coinId: string,
    days: number,
): BacktestResult {
    const strategyFactory = STRATEGIES[strategyKey];
    if (!strategyFactory) {
        throw new Error(`Unknown strategy: ${strategyKey}`);
    }

    const strategy = strategyFactory();
    strategy.init(candles, strategyParams);

    const trades: Trade[] = [];
    const equityCurve: EquityPoint[] = [];

    let equity = config.initialCapital;
    let peak = equity;
    let position: {
        entryIndex: number;
        entryPrice: number;
        side: 'long' | 'short';
    } | null = null;
    let tradeId = 0;

    // Record initial equity
    if (candles.length > 0) {
        equityCurve.push({
            timestamp: candles[0].timestamp,
            equity,
            drawdown: 0,
        });
    }

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const signal = strategy.evaluate(i);

        // Check stop-loss / take-profit if position is open
        if (position) {
            const unrealizedPnlPercent =
                position.side === 'long'
                    ? ((candle.close - position.entryPrice) / position.entryPrice) * 100
                    : ((position.entryPrice - candle.close) / position.entryPrice) * 100;

            let shouldClose = false;
            let closeReason = '';

            // Stop-loss check (using low for longs, high for shorts)
            if (config.stopLossPercent && config.stopLossPercent > 0) {
                const worstPrice =
                    position.side === 'long' ? candle.low : candle.high;
                const worstPnl =
                    position.side === 'long'
                        ? ((worstPrice - position.entryPrice) / position.entryPrice) * 100
                        : ((position.entryPrice - worstPrice) / position.entryPrice) * 100;

                if (worstPnl <= -config.stopLossPercent) {
                    shouldClose = true;
                    closeReason = 'stop-loss';
                }
            }

            // Take-profit check (using high for longs, low for shorts)
            if (!shouldClose && config.takeProfitPercent && config.takeProfitPercent > 0) {
                const bestPrice =
                    position.side === 'long' ? candle.high : candle.low;
                const bestPnl =
                    position.side === 'long'
                        ? ((bestPrice - position.entryPrice) / position.entryPrice) * 100
                        : ((position.entryPrice - bestPrice) / position.entryPrice) * 100;

                if (bestPnl >= config.takeProfitPercent) {
                    shouldClose = true;
                    closeReason = 'take-profit';
                }
            }

            // Strategy exit signal
            if (!shouldClose && signal && signal.type === 'exit') {
                shouldClose = true;
                closeReason = signal.reason;
            }

            if (shouldClose) {
                // Calculate exit price with slippage
                let exitPrice = candle.close;
                if (closeReason === 'stop-loss') {
                    // Stop-loss fills at the stop level, not at close
                    exitPrice =
                        position.side === 'long'
                            ? position.entryPrice * (1 - config.stopLossPercent! / 100)
                            : position.entryPrice * (1 + config.stopLossPercent! / 100);
                } else if (closeReason === 'take-profit') {
                    exitPrice =
                        position.side === 'long'
                            ? position.entryPrice * (1 + config.takeProfitPercent! / 100)
                            : position.entryPrice * (1 - config.takeProfitPercent! / 100);
                }

                // Apply slippage on exit
                const slippageMult =
                    position.side === 'long'
                        ? 1 - config.slippagePercent / 100
                        : 1 + config.slippagePercent / 100;
                exitPrice *= slippageMult;

                // PnL calculation
                const pnlPercent =
                    position.side === 'long'
                        ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
                        : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

                const commission = equity * (config.commissionPercent / 100) * 2; // entry + exit
                const pnlAbsolute = equity * (pnlPercent / 100) - commission;

                trades.push({
                    id: ++tradeId,
                    entryTimestamp: candles[position.entryIndex].timestamp,
                    exitTimestamp: candle.timestamp,
                    entryPrice: position.entryPrice,
                    exitPrice,
                    side: position.side,
                    pnlPercent: pnlPercent - (config.commissionPercent * 2),
                    pnlAbsolute,
                    commission,
                    holdingPeriodMs: candle.timestamp - candles[position.entryIndex].timestamp,
                });

                equity += pnlAbsolute;
                position = null;
            }
        }

        // Check entry signal (only if no position)
        if (!position && signal && signal.type === 'entry') {
            // Apply slippage on entry
            const slippageMult =
                signal.side === 'long'
                    ? 1 + config.slippagePercent / 100
                    : 1 - config.slippagePercent / 100;

            position = {
                entryIndex: i,
                entryPrice: candle.close * slippageMult,
                side: signal.side,
            };
        }

        // Update equity curve
        if (position) {
            // Mark-to-market: show unrealized PnL
            const unrealizedPnlPercent =
                position.side === 'long'
                    ? ((candle.close - position.entryPrice) / position.entryPrice) * 100
                    : ((position.entryPrice - candle.close) / position.entryPrice) * 100;
            const mtmEquity = equity + equity * (unrealizedPnlPercent / 100);
            if (mtmEquity > peak) peak = mtmEquity;
            equityCurve.push({
                timestamp: candle.timestamp,
                equity: mtmEquity,
                drawdown: peak - mtmEquity,
            });
        } else {
            if (equity > peak) peak = equity;
            equityCurve.push({
                timestamp: candle.timestamp,
                equity,
                drawdown: peak - equity,
            });
        }
    }

    // If still in a position at the end, force close at last candle
    if (position && candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        const exitPrice = lastCandle.close;
        const pnlPercent =
            position.side === 'long'
                ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
                : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

        const commission = equity * (config.commissionPercent / 100) * 2;
        const pnlAbsolute = equity * (pnlPercent / 100) - commission;

        trades.push({
            id: ++tradeId,
            entryTimestamp: candles[position.entryIndex].timestamp,
            exitTimestamp: lastCandle.timestamp,
            entryPrice: position.entryPrice,
            exitPrice,
            side: position.side,
            pnlPercent: pnlPercent - (config.commissionPercent * 2),
            pnlAbsolute,
            commission,
            holdingPeriodMs: lastCandle.timestamp - candles[position.entryIndex].timestamp,
        });

        equity += pnlAbsolute;
    }

    const metrics = calculateMetrics(trades, equityCurve, config.initialCapital);
    const monthlyBreakdown = calculateMonthlyBreakdown(trades, equityCurve);

    // Collect indicator data from strategy
    let indicatorData: Record<string, number[]> = {};
    if ('getIndicatorData' in strategy && typeof strategy.getIndicatorData === 'function') {
        indicatorData = strategy.getIndicatorData();
    }

    return {
        strategyName: strategy.name,
        coinId,
        days,
        config,
        trades,
        equityCurve,
        metrics,
        monthlyBreakdown,
        candles,
        indicatorData,
    };
}
