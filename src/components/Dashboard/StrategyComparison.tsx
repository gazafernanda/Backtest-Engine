import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
    CartesianGrid,
} from 'recharts';
import type { BacktestResult } from '../../types';
import { formatCurrency, formatDate } from '../../utils/format';

interface Props {
    results: BacktestResult[];
}

const COLORS = ['#00d4ff', '#00e676', '#ff9100', '#e040fb', '#ffea00', '#ff1744', '#76ff03', '#6979f8'];

export function StrategyComparison({ results }: Props) {
    const chartData = useMemo(() => {
        if (results.length === 0) return [];

        // Normalize all equity curves to same time axis
        // Use percentage return for fair comparison
        const allTimestamps = new Set<number>();
        results.forEach((r) => r.equityCurve.forEach((p) => allTimestamps.add(p.timestamp)));
        const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

        // Downsample
        const maxPoints = 400;
        const step = Math.max(1, Math.floor(sortedTimestamps.length / maxPoints));
        const sampledTimestamps = sortedTimestamps.filter(
            (_, i) => i % step === 0 || i === sortedTimestamps.length - 1,
        );

        return sampledTimestamps.map((ts) => {
            const point: Record<string, number | string> = {
                date: formatDate(ts),
                timestamp: ts,
            };

            results.forEach((r, idx) => {
                // Find closest equity point
                let closest = r.equityCurve[0];
                for (const p of r.equityCurve) {
                    if (Math.abs(p.timestamp - ts) < Math.abs(closest.timestamp - ts)) {
                        closest = p;
                    }
                }
                const returnPct = ((closest.equity - r.config.initialCapital) / r.config.initialCapital) * 100;
                point[`strategy_${idx}`] = Math.round(returnPct * 100) / 100;
            });

            return point;
        });
    }, [results]);

    if (results.length < 2) return null;

    return (
        <div className="chart-container">
            <div className="chart-header">
                <h3>Strategy Comparison</h3>
                <span className="chart-badge neutral">{results.length} strategies</span>
            </div>
            <div className="chart-body">
                <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                            dataKey="date"
                            tick={{ fill: '#8892b0', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            interval="preserveStartEnd"
                            minTickGap={60}
                        />
                        <YAxis
                            tick={{ fill: '#8892b0', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            tickFormatter={(v) => `${v}%`}
                            width={50}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1a1f3a',
                                border: '1px solid rgba(0, 212, 255, 0.2)',
                                borderRadius: '8px',
                                color: '#e6f1ff',
                                fontSize: '13px',
                            }}
                            formatter={(value: number, name: string) => {
                                const idx = parseInt(name.replace('strategy_', ''));
                                const r = results[idx];
                                return [`${value.toFixed(2)}%`, r ? r.strategyName : name];
                            }}
                            labelStyle={{ color: '#8892b0' }}
                        />
                        <Legend
                            formatter={(value: string) => {
                                const idx = parseInt(value.replace('strategy_', ''));
                                const r = results[idx];
                                return r ? `${r.strategyName} (${r.coinId})` : value;
                            }}
                            wrapperStyle={{ color: '#8892b0', fontSize: '12px' }}
                        />
                        {results.map((_, idx) => (
                            <Line
                                key={idx}
                                type="monotone"
                                dataKey={`strategy_${idx}`}
                                stroke={COLORS[idx % COLORS.length]}
                                strokeWidth={2}
                                dot={false}
                                animationDuration={1500}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Comparison Table */}
            <div className="trade-table-wrapper" style={{ marginTop: '16px' }}>
                <table className="trade-table">
                    <thead>
                        <tr>
                            <th>Strategy</th>
                            <th>Return</th>
                            <th>Win Rate</th>
                            <th>Profit Factor</th>
                            <th>Max DD</th>
                            <th>Sharpe</th>
                            <th>Trades</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((r, idx) => (
                            <tr key={idx}>
                                <td>
                                    <span style={{ color: COLORS[idx % COLORS.length], fontWeight: 600 }}>
                                        {r.strategyName}
                                    </span>
                                </td>
                                <td className={r.metrics.totalReturnPercent >= 0 ? 'positive' : 'negative'}>
                                    {r.metrics.totalReturnPercent.toFixed(2)}%
                                </td>
                                <td className={r.metrics.winRate >= 50 ? 'positive' : 'negative'}>
                                    {r.metrics.winRate.toFixed(1)}%
                                </td>
                                <td>
                                    {r.metrics.profitFactor === Infinity ? '∞' : r.metrics.profitFactor.toFixed(2)}
                                </td>
                                <td className="negative">{r.metrics.maxDrawdownPercent.toFixed(2)}%</td>
                                <td className={r.metrics.sharpeRatio >= 0 ? 'positive' : 'negative'}>
                                    {r.metrics.sharpeRatio.toFixed(2)}
                                </td>
                                <td>{r.metrics.totalTrades}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
