import type {
    Candle,
    Trade,
    EquityPoint,
    BacktestConfig,
    BacktestResult,
    Strategy,
} from '../types';
import { timeframeMs } from '../types';
import { calculateMetrics, calculateMonthlyBreakdown } from './metrics';
import { STRATEGIES } from './strategies';
import { isInSession } from './priceAction';
import {
    INSTRUMENTS,
    DEFAULT_INSTRUMENT,
    type InstrumentSpec,
    lotsForRisk,
    normalizeLots,
    pipValue,
    pipsToPrice,
    priceMoveToMoney,
    requiredMargin,
    toPips,
} from './instrument';

/** A position while it is open. */
interface OpenPosition {
    entryIndex: number;
    entryTimestamp: number;
    entryPrice: number;
    side: 'long' | 'short';
    lots: number;
    stopPrice: number | null;
    targetPrice: number | null;
    initialStopPrice: number | null;
    margin: number;
    equityAtEntry: number;
    swapAccrued: number;
    maePips: number;
    mfePips: number;
    entryReason: string;
    movedToBreakEven: boolean;
}

/**
 * Gold backtesting engine.
 *
 * Models a spot-metal CFD account: position sizes in lots, costs in pips and
 * per-lot commission, leverage with a stop-out level, and overnight swap.
 *
 * Execution assumptions, stated plainly because they decide the results:
 *
 *  1. Candle prices are treated as mid. Half the spread plus slippage is applied
 *     adversely to every fill, so a round trip pays one full spread either way.
 *  2. Signals are evaluated on a closed bar and fill at that bar's close. A
 *     position opened on bar i is first managed on bar i+1 — no lookahead.
 *  3. Stop and target triggers are checked against the bar's high/low. When both
 *     could have been hit inside one bar, the stop is taken. Intrabar order is
 *     unknowable from OHLC, and the pessimistic read is the honest one.
 *  4. Break-even moves are applied on the bar close and take effect the next
 *     bar, for the same reason.
 */
export function runBacktest(
    candles: Candle[],
    strategyKey: string,
    strategyParams: Record<string, number>,
    config: BacktestConfig,
    symbol: string,
    interval: string,
    isSyntheticData = false,
): BacktestResult {
    const strategyFactory = STRATEGIES[strategyKey];
    if (!strategyFactory) {
        throw new Error(`Unknown strategy: ${strategyKey}`);
    }

    const spec = INSTRUMENTS[symbol] ?? DEFAULT_INSTRUMENT;
    const strategy: Strategy = strategyFactory();
    strategy.init(candles, strategyParams, spec);

    const trades: Trade[] = [];
    const equityCurve: EquityPoint[] = [];

    /** Adverse price adjustment applied to every fill. */
    const fillCost = pipsToPrice(spec, config.spreadPips) / 2 + pipsToPrice(spec, config.slippagePips);

    let balance = config.initialCapital;
    let peak = balance;
    let stopOutCount = 0;
    let tradeId = 0;
    let position: OpenPosition | null = null;

    if (candles.length > 0) {
        equityCurve.push({ timestamp: candles[0].timestamp, equity: balance, drawdown: 0 });
    }

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const signal = strategy.evaluate(i);

        // ── Manage an open position ──────────────────────────
        if (position) {
            const open = position;
            const dir = open.side === 'long' ? 1 : -1;

            // Overnight financing for each rollover crossed since the last bar.
            if (i > 0) {
                const nights = rolloversBetween(candles[i - 1].timestamp, candle.timestamp);
                if (nights > 0) {
                    const perLot =
                        open.side === 'long' ? config.swapLongPerLot : config.swapShortPerLot;
                    open.swapAccrued += perLot * open.lots * nights;
                }
            }

            // Excursion tracking, in pips, against the bar's extremes.
            const bestPrice = open.side === 'long' ? candle.high : candle.low;
            const worstPrice = open.side === 'long' ? candle.low : candle.high;
            open.mfePips = Math.max(open.mfePips, toPips(spec, (bestPrice - open.entryPrice) * dir));
            open.maePips = Math.min(open.maePips, toPips(spec, (worstPrice - open.entryPrice) * dir));

            let rawExit: number | null = null;
            let exitReason = '';

            // Stop first — see assumption 3.
            if (open.stopPrice !== null) {
                const hit =
                    open.side === 'long' ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
                if (hit) {
                    rawExit = open.stopPrice;
                    exitReason = open.movedToBreakEven ? 'break-even stop' : 'stop-loss';
                }
            }

            if (rawExit === null && open.targetPrice !== null) {
                const hit =
                    open.side === 'long'
                        ? candle.high >= open.targetPrice
                        : candle.low <= open.targetPrice;
                if (hit) {
                    rawExit = open.targetPrice;
                    exitReason = 'take-profit';
                }
            }

            if (rawExit === null && signal && signal.type === 'exit' && signal.side === open.side) {
                rawExit = candle.close;
                exitReason = signal.reason;
            }

            // Margin stop-out, evaluated on the bar close.
            if (rawExit === null && open.margin > 0 && config.stopOutLevel > 0) {
                const unrealized = priceMoveToMoney(
                    spec,
                    open.side,
                    open.entryPrice,
                    candle.close,
                    open.lots,
                );
                const equityNow = balance + unrealized - open.swapAccrued;
                if ((equityNow / open.margin) * 100 < config.stopOutLevel) {
                    rawExit = candle.close;
                    exitReason = 'margin stop-out';
                    stopOutCount++;
                }
            }

            if (rawExit !== null) {
                const trade = buildTrade(spec, config, open, rawExit, exitReason, candle.timestamp, ++tradeId, fillCost);
                trades.push(trade);
                balance += trade.pnlAbsolute;
                position = null;
            } else if (config.breakEvenPips > 0 && !open.movedToBreakEven) {
                // Break-even management, applied on close so it binds next bar.
                const openPips = toPips(spec, (candle.close - open.entryPrice) * dir);
                if (openPips >= config.breakEvenPips) {
                    open.stopPrice = open.entryPrice;
                    open.movedToBreakEven = true;
                }
            }
        }

        // ── Look for an entry ────────────────────────────────
        if (!position && signal && signal.type === 'entry') {
            if (isInSession(candle.timestamp, config.sessionFilter)) {
                position = tryOpenPosition(spec, config, candle, i, signal.side, signal.reason, balance, fillCost, signal.stopPrice, signal.targetPrice);
            }
        }

        // ── Mark to market ───────────────────────────────────
        let equity = balance;
        if (position) {
            equity +=
                priceMoveToMoney(spec, position.side, position.entryPrice, candle.close, position.lots) -
                position.swapAccrued;
        }
        if (equity > peak) peak = equity;
        equityCurve.push({ timestamp: candle.timestamp, equity, drawdown: peak - equity });
    }

    // Force-close anything still open on the final bar.
    if (position && candles.length > 0) {
        const last = candles[candles.length - 1];
        const trade = buildTrade(spec, config, position, last.close, 'end of data', last.timestamp, ++tradeId, fillCost);
        trades.push(trade);
        balance += trade.pnlAbsolute;
        position = null;

        if (equityCurve.length > 0) {
            equityCurve[equityCurve.length - 1] = {
                timestamp: last.timestamp,
                equity: balance,
                drawdown: Math.max(0, peak - balance),
            };
        }
    }

    const metrics = calculateMetrics(
        trades,
        equityCurve,
        config.initialCapital,
        timeframeMs(interval),
        stopOutCount,
    );

    return {
        strategyName: strategy.name,
        symbol,
        interval,
        barCount: candles.length,
        config,
        trades,
        equityCurve,
        metrics,
        monthlyBreakdown: calculateMonthlyBreakdown(trades),
        candles,
        indicatorData: strategy.getIndicatorData(),
        isSyntheticData,
    };
}

/**
 * Resolve stop, target and size for a new entry.
 * Returns null when the trade cannot be taken — no valid stop for risk-based
 * sizing, a size below the broker minimum, or not enough free margin.
 */
function tryOpenPosition(
    spec: InstrumentSpec,
    config: BacktestConfig,
    candle: Candle,
    index: number,
    side: 'long' | 'short',
    reason: string,
    balance: number,
    fillCost: number,
    structuralStop?: number,
    structuralTarget?: number,
): OpenPosition | null {
    const dir = side === 'long' ? 1 : -1;
    const entryPrice = candle.close + dir * fillCost;

    // A structural level from the strategy wins over the fixed pip distance —
    // it is what actually invalidates the setup.
    let stopPrice: number | null = null;
    if (structuralStop !== undefined && isFinite(structuralStop)) {
        const onCorrectSide =
            side === 'long' ? structuralStop < entryPrice : structuralStop > entryPrice;
        if (onCorrectSide) stopPrice = structuralStop;
    }
    if (stopPrice === null && config.stopLossPips > 0) {
        stopPrice = entryPrice - dir * pipsToPrice(spec, config.stopLossPips);
    }

    const riskPips = stopPrice !== null ? Math.abs(toPips(spec, entryPrice - stopPrice)) : 0;

    let lots: number;
    if (config.sizingMode === 'riskPercent') {
        if (riskPips <= 0) return null; // Risk-based sizing is meaningless without a stop.
        lots = lotsForRisk(spec, balance * (config.riskPercent / 100), riskPips);
    } else {
        lots = normalizeLots(spec, config.fixedLot);
    }
    if (lots <= 0) return null;

    const margin = requiredMargin(spec, entryPrice, lots, config.leverage);
    if (margin > balance) return null;

    let targetPrice: number | null = null;
    if (structuralTarget !== undefined && isFinite(structuralTarget)) {
        const onCorrectSide =
            side === 'long' ? structuralTarget > entryPrice : structuralTarget < entryPrice;
        if (onCorrectSide) targetPrice = structuralTarget;
    }
    if (targetPrice === null && config.takeProfitPips > 0) {
        targetPrice = entryPrice + dir * pipsToPrice(spec, config.takeProfitPips);
    }

    return {
        entryIndex: index,
        entryTimestamp: candle.timestamp,
        entryPrice,
        side,
        lots,
        stopPrice,
        targetPrice,
        initialStopPrice: stopPrice,
        margin,
        equityAtEntry: balance,
        swapAccrued: 0,
        maePips: 0,
        mfePips: 0,
        entryReason: reason,
        movedToBreakEven: false,
    };
}

function buildTrade(
    spec: InstrumentSpec,
    config: BacktestConfig,
    open: OpenPosition,
    rawExitPrice: number,
    exitReason: string,
    exitTimestamp: number,
    id: number,
    fillCost: number,
): Trade {
    const dir = open.side === 'long' ? 1 : -1;
    const exitPrice = rawExitPrice - dir * fillCost;

    const grossPnl = priceMoveToMoney(spec, open.side, open.entryPrice, exitPrice, open.lots);
    const commission = config.commissionPerLot * open.lots * 2; // entry + exit
    const swap = open.swapAccrued;
    const pnlAbsolute = grossPnl - commission - swap;

    const riskPips =
        open.initialStopPrice !== null
            ? Math.abs(toPips(spec, open.entryPrice - open.initialStopPrice))
            : 0;
    const riskMoney = riskPips > 0 ? riskPips * pipValue(spec, open.lots) : 0;

    return {
        id,
        entryTimestamp: open.entryTimestamp,
        exitTimestamp,
        entryPrice: open.entryPrice,
        exitPrice,
        side: open.side,
        lots: open.lots,
        pips: toPips(spec, (exitPrice - open.entryPrice) * dir),
        grossPnl,
        commission,
        swap,
        pnlAbsolute,
        pnlPercent: open.equityAtEntry > 0 ? (pnlAbsolute / open.equityAtEntry) * 100 : 0,
        riskPips,
        rMultiple: riskMoney > 0 ? pnlAbsolute / riskMoney : 0,
        maePips: open.maePips,
        mfePips: open.mfePips,
        exitReason,
        entryReason: open.entryReason,
        holdingPeriodMs: exitTimestamp - open.entryTimestamp,
    };
}

/**
 * Number of 22:00-UTC rollovers strictly between two timestamps, with the
 * Wednesday rollover counted three times — the standard forex/metals convention
 * for booking the weekend's financing.
 */
function rolloversBetween(fromTs: number, toTs: number): number {
    if (toTs <= fromTs) return 0;

    const ROLLOVER_HOUR = 22;
    let count = 0;

    const d = new Date(fromTs);
    d.setUTCHours(ROLLOVER_HOUR, 0, 0, 0);
    if (d.getTime() <= fromTs) d.setUTCDate(d.getUTCDate() + 1);

    while (d.getTime() <= toTs) {
        const day = d.getUTCDay();
        // No financing is booked over the closed weekend itself.
        if (day !== 5 && day !== 6) count += day === 3 ? 3 : 1;
        d.setUTCDate(d.getUTCDate() + 1);
    }

    return count;
}
