import React from 'react';
import type { MonthlyResult } from '../../types';
import { formatCurrency, formatPercent } from '../../utils/format';

interface Props {
    monthlyBreakdown: MonthlyResult[];
}

export function MonthlyBreakdown({ monthlyBreakdown }: Props) {
    if (monthlyBreakdown.length === 0) {
        return null;
    }

    const totalPnl = monthlyBreakdown.reduce((s, m) => s + m.pnl, 0);
    const totalTrades = monthlyBreakdown.reduce((s, m) => s + m.trades, 0);
    const totalPips = monthlyBreakdown.reduce((s, m) => s + m.pips, 0);

    // Color intensity calculation
    const maxAbsPnl = Math.max(...monthlyBreakdown.map((m) => Math.abs(m.pnlPercent)), 1);

    function getPnlColor(pnlPercent: number): string {
        const intensity = Math.min(Math.abs(pnlPercent) / maxAbsPnl, 1);
        const alpha = 0.1 + intensity * 0.4;
        return pnlPercent >= 0
            ? `rgba(0, 230, 118, ${alpha})`
            : `rgba(255, 23, 68, ${alpha})`;
    }

    return (
        <div className="chart-container">
            <div className="chart-header">
                <h3>Monthly Breakdown</h3>
                <div className={`chart-badge ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(totalPnl)}
                </div>
            </div>
            <div className="trade-table-wrapper">
                <table className="trade-table monthly-table">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>PnL</th>
                            <th>PnL %</th>
                            <th>Pips</th>
                            <th>Trades</th>
                            <th>Win Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthlyBreakdown.map((m) => (
                            <tr key={m.label}>
                                <td className="month-label">{m.label}</td>
                                <td
                                    className={`trade-pnl ${m.pnl >= 0 ? 'positive' : 'negative'}`}
                                    style={{ backgroundColor: getPnlColor(m.pnlPercent) }}
                                >
                                    {formatCurrency(m.pnl)}
                                </td>
                                <td className={`trade-pnl ${m.pnlPercent >= 0 ? 'positive' : 'negative'}`}>
                                    {formatPercent(m.pnlPercent)}
                                </td>
                                <td className={`trade-pnl ${m.pips >= 0 ? 'positive' : 'negative'}`}>
                                    {m.pips >= 0 ? '+' : ''}{m.pips.toFixed(1)}
                                </td>
                                <td>{m.trades}</td>
                                <td className={m.winRate >= 50 ? 'positive' : 'negative'}>
                                    {m.winRate.toFixed(0)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="monthly-total">
                            <td><strong>Total</strong></td>
                            <td className={`trade-pnl ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
                                <strong>{formatCurrency(totalPnl)}</strong>
                            </td>
                            <td></td>
                            <td className={`trade-pnl ${totalPips >= 0 ? 'positive' : 'negative'}`}>
                                <strong>{totalPips >= 0 ? '+' : ''}{totalPips.toFixed(1)}</strong>
                            </td>
                            <td><strong>{totalTrades}</strong></td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
