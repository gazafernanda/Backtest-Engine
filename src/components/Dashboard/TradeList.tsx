import React, { useState, useMemo } from 'react';
import type { Trade } from '../../types';
import { formatCurrency, formatPercent, formatDateTime, formatDuration } from '../../utils/format';

interface Props {
    trades: Trade[];
}

type SortKey = 'id' | 'entryTimestamp' | 'pnlPercent' | 'pnlAbsolute' | 'holdingPeriodMs';

export function TradeList({ trades }: Props) {
    const [sortKey, setSortKey] = useState<SortKey>('id');
    const [sortAsc, setSortAsc] = useState(true);
    const [page, setPage] = useState(0);
    const perPage = 15;

    const sorted = useMemo(() => {
        return [...trades].sort((a, b) => {
            const mul = sortAsc ? 1 : -1;
            return (a[sortKey] - b[sortKey]) * mul;
        });
    }, [trades, sortKey, sortAsc]);

    const pageCount = Math.ceil(sorted.length / perPage);
    const paginated = sorted.slice(page * perPage, (page + 1) * perPage);

    function handleSort(key: SortKey) {
        if (sortKey === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortKey(key);
            setSortAsc(true);
        }
    }

    function sortIcon(key: SortKey) {
        if (sortKey !== key) return '';
        return sortAsc ? ' ↑' : ' ↓';
    }

    if (trades.length === 0) {
        return (
            <div className="chart-container">
                <div className="chart-header">
                    <h3>Trade List</h3>
                </div>
                <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    <p>No trades generated for this backtest.</p>
                    <p className="empty-sub">Try adjusting strategy parameters or timeframe.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="chart-container">
            <div className="chart-header">
                <h3>Trade List</h3>
                <span className="chart-badge neutral">{trades.length} trades</span>
            </div>
            <div className="trade-table-wrapper">
                <table className="trade-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('id')}>#{sortIcon('id')}</th>
                            <th>Side</th>
                            <th onClick={() => handleSort('entryTimestamp')}>Entry{sortIcon('entryTimestamp')}</th>
                            <th>Exit</th>
                            <th>Entry $</th>
                            <th>Exit $</th>
                            <th onClick={() => handleSort('pnlPercent')}>PnL %{sortIcon('pnlPercent')}</th>
                            <th onClick={() => handleSort('pnlAbsolute')}>PnL ${sortIcon('pnlAbsolute')}</th>
                            <th onClick={() => handleSort('holdingPeriodMs')}>Duration{sortIcon('holdingPeriodMs')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((trade) => (
                            <tr key={trade.id} className={trade.pnlAbsolute >= 0 ? 'trade-win' : 'trade-loss'}>
                                <td className="trade-id">{trade.id}</td>
                                <td>
                                    <span className={`trade-side ${trade.side}`}>
                                        {trade.side.toUpperCase()}
                                    </span>
                                </td>
                                <td className="trade-date">{formatDateTime(trade.entryTimestamp)}</td>
                                <td className="trade-date">{formatDateTime(trade.exitTimestamp)}</td>
                                <td className="trade-price">{formatCurrency(trade.entryPrice)}</td>
                                <td className="trade-price">{formatCurrency(trade.exitPrice)}</td>
                                <td className={`trade-pnl ${trade.pnlPercent >= 0 ? 'positive' : 'negative'}`}>
                                    {formatPercent(trade.pnlPercent)}
                                </td>
                                <td className={`trade-pnl ${trade.pnlAbsolute >= 0 ? 'positive' : 'negative'}`}>
                                    {formatCurrency(trade.pnlAbsolute)}
                                </td>
                                <td className="trade-duration">{formatDuration(trade.holdingPeriodMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {pageCount > 1 && (
                <div className="trade-pagination">
                    <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                        ← Prev
                    </button>
                    <span>
                        Page {page + 1} of {pageCount}
                    </span>
                    <button disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
