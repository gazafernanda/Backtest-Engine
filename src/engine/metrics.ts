import type { Trade, PerformanceMetrics, EquityPoint, MonthlyResult } from '../types';

/** Gold trades roughly 24h × 5 days a week, ~52 weeks a year. */
const TRADING_HOURS_PER_YEAR = 24 * 5 * 52;
const TRADING_MS_PER_YEAR = TRADING_HOURS_PER_YEAR * 60 * 60 * 1000;

/**
 * Performance metrics for a completed run.
 *
 * Money figures are in the quote currency (USD for XAU/USD). `barMs` is the
 * duration of one candle and is used to annualise the Sharpe ratio — using a
 * fixed 365-day factor on M1 data would inflate it by more than an order of
 * magnitude.
 */
export function calculateMetrics(
    trades: Trade[],
    equityCurve: EquityPoint[],
    initialCapital: number,
    barMs: number,
    stopOutCount = 0,
): PerformanceMetrics {
    const wins = trades.filter((t) => t.pnlAbsolute > 0);
    const losses = trades.filter((t) => t.pnlAbsolute <= 0);

    const grossProfit = wins.reduce((s, t) => s + t.pnlAbsolute, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlAbsolute, 0));

    const totalReturn =
        equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity - initialCapital : 0;

    // Max drawdown, walked from the equity curve.
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

    // Sharpe, annualised from per-bar returns.
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
        const prev = equityCurve[i - 1].equity;
        if (prev > 0) returns.push((equityCurve[i].equity - prev) / prev);
    }
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev =
        returns.length > 1
            ? Math.sqrt(
                  returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1),
              )
            : 0;
    const periodsPerYear = barMs > 0 ? TRADING_MS_PER_YEAR / barMs : 252;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(periodsPerYear) : 0;

    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? -grossLoss / losses.length : 0;
    const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnlAbsolute)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnlAbsolute)) : 0;

    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const expectancy =
        trades.length > 0 ? trades.reduce((s, t) => s + t.pnlAbsolute, 0) / trades.length : 0;

    // R-based stats only count trades that actually carried a stop.
    const withRisk = trades.filter((t) => t.riskPips > 0);
    const avgRMultiple =
        withRisk.length > 0 ? withRisk.reduce((s, t) => s + t.rMultiple, 0) / withRisk.length : 0;

    const { maxWins, maxLosses } = streaks(trades);

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
        expectancyR: avgRMultiple,
        totalReturn,
        totalReturnPercent: initialCapital > 0 ? (totalReturn / initialCapital) * 100 : 0,
        totalPips: trades.reduce((s, t) => s + t.pips, 0),
        avgWin,
        avgLoss,
        largestWin,
        largestLoss,
        avgRMultiple,
        maxConsecutiveWins: maxWins,
        maxConsecutiveLosses: maxLosses,
        avgHoldingPeriodMs:
            trades.length > 0 ? trades.reduce((s, t) => s + t.holdingPeriodMs, 0) / trades.length : 0,
        grossProfit,
        grossLoss,
        totalCommission: trades.reduce((s, t) => s + t.commission, 0),
        totalSwap: trades.reduce((s, t) => s + t.swap, 0),
        stopOutCount,
    };
}

function streaks(trades: Trade[]): { maxWins: number; maxLosses: number } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const t of trades) {
        if (t.pnlAbsolute > 0) {
            currentWins++;
            currentLosses = 0;
            if (currentWins > maxWins) maxWins = currentWins;
        } else {
            currentLosses++;
            currentWins = 0;
            if (currentLosses > maxLosses) maxLosses = currentLosses;
        }
    }

    return { maxWins, maxLosses };
}

/**
 * Group closed trades by calendar month of their exit.
 *
 * `pnlPercent` is compounded across the month's trades rather than summed —
 * each trade's percent is measured against the equity it actually had at entry,
 * so adding them would misstate the month.
 */
export function calculateMonthlyBreakdown(trades: Trade[]): MonthlyResult[] {
    const monthMap = new Map<string, Trade[]>();

    for (const trade of trades) {
        const d = new Date(trade.exitTimestamp);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const bucket = monthMap.get(key);
        if (bucket) bucket.push(trade);
        else monthMap.set(key, [trade]);
    }

    return Array.from(monthMap.keys())
        .sort()
        .map((key) => {
            const [yearStr, monthStr] = key.split('-');
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10);
            const bucket = monthMap.get(key)!;

            const wins = bucket.filter((t) => t.pnlAbsolute > 0).length;
            const compounded =
                bucket.reduce((acc, t) => acc * (1 + t.pnlPercent / 100), 1) - 1;

            return {
                year,
                month,
                label: new Date(Date.UTC(year, month - 1)).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                }),
                pnl: bucket.reduce((s, t) => s + t.pnlAbsolute, 0),
                pnlPercent: compounded * 100,
                pips: bucket.reduce((s, t) => s + t.pips, 0),
                trades: bucket.length,
                winRate: bucket.length > 0 ? (wins / bucket.length) * 100 : 0,
            };
        });
}
