import React, { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Cell,
} from 'recharts';
import type { EquityPoint } from '../../types';
import { formatDate, formatPercent } from '../../utils/format';

interface Props {
    equityCurve: EquityPoint[];
    initialCapital: number;
}

export function DrawdownChart({ equityCurve, initialCapital }: Props) {
    const chartData = useMemo(() => {
        const maxPoints = 300;
        const step = Math.max(1, Math.floor(equityCurve.length / maxPoints));

        let peak = initialCapital;
        return equityCurve
            .filter((_, i) => i % step === 0 || i === equityCurve.length - 1)
            .map((point) => {
                if (point.equity > peak) peak = point.equity;
                const ddPercent = peak > 0 ? -((peak - point.equity) / peak) * 100 : 0;
                return {
                    date: formatDate(point.timestamp),
                    drawdown: Math.round(ddPercent * 100) / 100,
                };
            });
    }, [equityCurve, initialCapital]);

    return (
        <div className="chart-container">
            <div className="chart-header">
                <h3>Drawdown</h3>
            </div>
            <div className="chart-body">
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                                border: '1px solid rgba(255, 23, 68, 0.2)',
                                borderRadius: '8px',
                                color: '#e6f1ff',
                                fontSize: '13px',
                            }}
                            formatter={(value: number) => [formatPercent(value), 'Drawdown']}
                            labelStyle={{ color: '#8892b0' }}
                        />
                        <Bar dataKey="drawdown" animationDuration={1200}>
                            {chartData.map((entry, idx) => (
                                <Cell
                                    key={idx}
                                    fill={
                                        entry.drawdown <= -20
                                            ? 'rgba(255, 23, 68, 0.8)'
                                            : entry.drawdown <= -10
                                                ? 'rgba(255, 23, 68, 0.5)'
                                                : 'rgba(255, 23, 68, 0.3)'
                                    }
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
