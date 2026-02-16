import React from 'react';
import type { PerformanceMetrics } from '../../types';
import { formatCurrency, formatPercent, formatNumber, formatDuration } from '../../utils/format';

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
            label: 'Total Return',
            value: formatCurrency(metrics.totalReturn),
            subLabel: formatPercent(metrics.totalReturnPercent),
            color: metrics.totalReturn >= 0 ? 'green' : 'red',
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
            subLabel: `$${metrics.grossProfit.toFixed(0)} / $${metrics.grossLoss.toFixed(0)}`,
            color: metrics.profitFactor >= 1.5 ? 'green' : metrics.profitFactor >= 1 ? 'yellow' : 'red',
        },
        {
            label: 'Sharpe Ratio',
            value: formatNumber(metrics.sharpeRatio),
            subLabel: 'Annualized',
            color: metrics.sharpeRatio >= 1 ? 'green' : metrics.sharpeRatio >= 0 ? 'yellow' : 'red',
        },
        {
            label: 'Max Drawdown',
            value: formatPercent(-metrics.maxDrawdownPercent),
            subLabel: formatCurrency(-metrics.maxDrawdown),
            color: metrics.maxDrawdownPercent <= 10 ? 'green' : metrics.maxDrawdownPercent <= 25 ? 'yellow' : 'red',
        },
        {
            label: 'Expectancy',
            value: formatPercent(metrics.expectancy),
            subLabel: 'Per Trade',
            color: metrics.expectancy > 0 ? 'green' : 'red',
        },
        {
            label: 'Total Trades',
            value: `${metrics.totalTrades}`,
            subLabel: `Avg hold: ${formatDuration(metrics.avgHoldingPeriodMs)}`,
            color: 'blue',
        },
        {
            label: 'Avg Win / Loss',
            value: `${formatPercent(metrics.avgWin)}`,
            subLabel: `Loss: ${formatPercent(metrics.avgLoss)}`,
            color: 'neutral',
        },
        {
            label: 'Best / Worst',
            value: formatPercent(metrics.largestWin),
            subLabel: `Worst: ${formatPercent(metrics.largestLoss)}`,
            color: 'neutral',
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
