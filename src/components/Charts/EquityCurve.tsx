import React, { useMemo } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    CartesianGrid,
} from 'recharts';
import type { EquityPoint, Trade } from '../../types';
import { formatCurrency, formatDate } from '../../utils/format';

interface Props {
    equityCurve: EquityPoint[];
    trades: Trade[];
    initialCapital: number;
}

export function EquityCurve({ equityCurve, trades, initialCapital }: Props) {
    const chartData = useMemo(() => {
        // Downsample if too many points for chart performance
        const maxPoints = 500;
        const step = Math.max(1, Math.floor(equityCurve.length / maxPoints));

        return equityCurve
            .filter((_, i) => i % step === 0 || i === equityCurve.length - 1)
            .map((point) => ({
                date: formatDate(point.timestamp),
                timestamp: point.timestamp,
                equity: Math.round(point.equity * 100) / 100,
                drawdown: Math.round(point.drawdown * 100) / 100,
            }));
    }, [equityCurve]);

    const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCapital;
    const isProfit = finalEquity >= initialCapital;

    return (
        <div className="chart-container">
            <div className="chart-header">
                <h3>Equity Curve</h3>
                <div className={`chart-badge ${isProfit ? 'positive' : 'negative'}`}>
                    {formatCurrency(finalEquity)}
                </div>
            </div>
            <div className="chart-body">
                <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop
                                    offset="5%"
                                    stopColor={isProfit ? '#00e676' : '#ff1744'}
                                    stopOpacity={0.3}
                                />
                                <stop
                                    offset="95%"
                                    stopColor={isProfit ? '#00e676' : '#ff1744'}
                                    stopOpacity={0}
                                />
                            </linearGradient>
                        </defs>
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
                            tickFormatter={(v) => formatCurrency(v)}
                            width={70}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1a1f3a',
                                border: '1px solid rgba(0, 212, 255, 0.2)',
                                borderRadius: '8px',
                                color: '#e6f1ff',
                                fontSize: '13px',
                            }}
                            formatter={(value: number) => [formatCurrency(value), 'Equity']}
                            labelStyle={{ color: '#8892b0' }}
                        />
                        <ReferenceLine
                            y={initialCapital}
                            stroke="rgba(255,255,255,0.2)"
                            strokeDasharray="5 5"
                            label={{
                                value: 'Initial',
                                fill: '#8892b0',
                                fontSize: 11,
                                position: 'right',
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="equity"
                            stroke={isProfit ? '#00e676' : '#ff1744'}
                            strokeWidth={2}
                            fill="url(#equityGradient)"
                            animationDuration={1500}
                            animationEasing="ease-out"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
