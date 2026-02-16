import type { Trade, PerformanceMetrics, EquityPoint, MonthlyResult } from '../types';

/**
 * Calculate all performance metrics from a list of trades and equity curve.
 */
export function calculateMetrics(
    trades: Trade[],
    equityCurve: EquityPoint[],
    initialCapital: number,
): PerformanceMetrics {
    const wins = trades.filter((t) => t.pnlAbsolute > 0);
    const losses = trades.filter((t) => t.pnlAbsolute <= 0);

    const grossProfit = wins.reduce((sum, t) => sum + t.pnlAbsolute, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnlAbsolute, 0));

    const totalReturn = equityCurve.length > 0
        ? equityCurve[equityCurve.length - 1].equity - initialCapital
        : 0;

    // Max drawdown from equity curve
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = initialCapital;
    for (const point of equityCurve) {
        if (point.equity > peak) peak = point.equity;
        const dd = peak - point.equity;
        const ddPercent = peak > 0 ? (dd / peak) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
        if (ddPercent > maxDrawdownPercent) maxDrawdownPercent = ddPercent;
    }

    // Sharpe Ratio (annualized, assuming daily returns)
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
        const prevEq = equityCurve[i - 1].equity;
        if (prevEq > 0) {
            returns.push((equityCurve[i].equity - prevEq) / prevEq);
        }
    }
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 1
        ? Math.sqrt(returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length - 1))
        : 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;

    // Win/loss averages
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0;
    const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnlPercent)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnlPercent)) : 0;

    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Expectancy = (winRate% × avgWin) + (lossRate% × avgLoss)
    const expectancy = trades.length > 0
        ? (wins.length / trades.length) * avgWin + (losses.length / trades.length) * avgLoss
        : 0;

    const avgHoldingPeriodMs = trades.length > 0
        ? trades.reduce((s, t) => s + t.holdingPeriodMs, 0) / trades.length
        : 0;

    return {
        totalTrades: trades.length,
        winningTrades: wins.length,
        losingTrades: losses.length,
        winRate,
        profitFactor,
        maxDrawdown,
        maxDrawdownPercent,
        sharpeRatio,
        expectancy,
        totalReturn,
        totalReturnPercent: initialCapital > 0 ? (totalReturn / initialCapital) * 100 : 0,
        avgWin,
        avgLoss,
        largestWin,
        largestLoss,
        avgHoldingPeriodMs,
        grossProfit,
        grossLoss,
    };
}

/**
 * Group trades into monthly breakdown.
 */
export function calculateMonthlyBreakdown(
    trades: Trade[],
    equityCurve: EquityPoint[],
): MonthlyResult[] {
    const monthMap = new Map<string, { pnl: number; trades: Trade[] }>();

    for (const trade of trades) {
        const d = new Date(trade.exitTimestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthMap.has(key)) {
            monthMap.set(key, { pnl: 0, trades: [] });
        }
        const entry = monthMap.get(key)!;
        entry.pnl += trade.pnlAbsolute;
        entry.trades.push(trade);
    }

    const results: MonthlyResult[] = [];
    const sortedKeys = Array.from(monthMap.keys()).sort();

    // Find the starting equity for each month from the equity curve
    for (const key of sortedKeys) {
        const [yearStr, monthStr] = key.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const entry = monthMap.get(key)!;

        const wins = entry.trades.filter((t) => t.pnlAbsolute > 0).length;
        const monthLabel = new Date(year, month - 1).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
        });

        // Estimate pnlPercent using trade-level percent returns
        const pnlPercent = entry.trades.reduce((s, t) => s + t.pnlPercent, 0);

        results.push({
            year,
            month,
            label: monthLabel,
            pnl: entry.pnl,
            pnlPercent,
            trades: entry.trades.length,
            winRate: entry.trades.length > 0 ? (wins / entry.trades.length) * 100 : 0,
        });
    }

    return results;
}
