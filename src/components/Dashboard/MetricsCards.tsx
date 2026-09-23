import React from 'react';
import type { PerformanceMetrics } from '../../types';
import {
    formatCurrency,
    formatSignedCurrency,
    formatPercent,
    formatNumber,
    formatDuration,
    formatR,
} from '../../utils/format';

interface Props {
    metrics: PerformanceMetrics;
}

interface MetricCard {
    label: string;
    value: string;
    subLabel?: string;
    color: 'green' | 'red' | 'blue' | 'yellow' | 'neutral';
}

export function MetricsCards({ metrics }: Props) {
    const cards: MetricCard[] = [
        {
            label: 'Net Return',
            value: formatSignedCurrency(metrics.totalReturn),
            subLabel: formatPercent(metrics.totalReturnPercent),
            color: metrics.totalReturn >= 0 ? 'green' : 'red',
        },
        {
            label: 'Net Pips',
            value: `${metrics.totalPips >= 0 ? '+' : ''}${metrics.totalPips.toFixed(1)}`,
            subLabel: `Avg ${formatR(metrics.avgRMultiple)} per trade`,
            color: metrics.totalPips >= 0 ? 'green' : 'red',
        },
        {
            label: 'Win Rate',
            value: `${metrics.winRate.toFixed(1)}%`,
            subLabel: `${metrics.winningTrades}W / ${metrics.losingTrades}L`,
            color: metrics.winRate >= 50 ? 'green' : metrics.winRate >= 40 ? 'yellow' : 'red',
        },
        {
            label: 'Profit Factor',
            value: metrics.profitFactor === Infinity ? '∞' : formatNumber(metrics.profitFactor),
            subLabel: `${formatCurrency(metrics.grossProfit)} / ${formatCurrency(metrics.grossLoss)}`,
            color: metrics.profitFactor >= 1.5 ? 'green' : metrics.profitFactor >= 1 ? 'yellow' : 'red',
        },
        {
            label: 'Expectancy',
            value: formatSignedCurrency(metrics.expectancy),
            subLabel: `${formatR(metrics.expectancyR)} per trade`,
            color: metrics.expectancy > 0 ? 'green' : 'red',
        },
        {
            label: 'Max Drawdown',
            value: formatPercent(-metrics.maxDrawdownPercent),
            subLabel: formatCurrency(-metrics.maxDrawdown),
            color:
                metrics.maxDrawdownPercent <= 10
                    ? 'green'
                    : metrics.maxDrawdownPercent <= 25
                        ? 'yellow'
                        : 'red',
        },
        {
            label: 'Sharpe Ratio',
            value: formatNumber(metrics.sharpeRatio),
            subLabel: 'Annualised',
            color: metrics.sharpeRatio >= 1 ? 'green' : metrics.sharpeRatio >= 0 ? 'yellow' : 'red',
        },
        {
            label: 'Trades',
            value: `${metrics.totalTrades}`,
            subLabel: `Avg hold ${formatDuration(metrics.avgHoldingPeriodMs)}`,
            color: 'blue',
        },
        {
            label: 'Avg Win / Loss',
            value: formatSignedCurrency(metrics.avgWin),
            subLabel: `Loss ${formatSignedCurrency(metrics.avgLoss)}`,
            color: 'neutral',
        },
        {
            label: 'Best / Worst',
            value: formatSignedCurrency(metrics.largestWin),
            subLabel: `Worst ${formatSignedCurrency(metrics.largestLoss)}`,
            color: 'neutral',
        },
        {
            label: 'Longest Streak',
            value: `${metrics.maxConsecutiveLosses}L`,
            subLabel: `Best run ${metrics.maxConsecutiveWins}W`,
            color: metrics.maxConsecutiveLosses >= 8 ? 'red' : 'neutral',
        },
        {
            label: 'Trading Costs',
            value: formatCurrency(metrics.totalCommission + Math.abs(metrics.totalSwap)),
            subLabel:
                metrics.stopOutCount > 0
                    ? `${metrics.stopOutCount} margin stop-out${metrics.stopOutCount > 1 ? 's' : ''}`
                    : `Commission ${formatCurrency(metrics.totalCommission)}`,
            color: metrics.stopOutCount > 0 ? 'red' : 'neutral',
        },
    ];

    return (
        <div className="metrics-grid">
            {cards.map((card, i) => (
                <div key={i} className={`metric-card metric-${card.color}`}>
                    <div className="metric-label">{card.label}</div>
                    <div className="metric-value">{card.value}</div>
                    {card.subLabel && <div className="metric-sub">{card.subLabel}</div>}
                </div>
            ))}
        </div>
    );
}
