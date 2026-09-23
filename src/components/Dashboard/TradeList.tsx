import React, { useState, useMemo } from 'react';
import type { Trade } from '../../types';
import {
    formatSignedCurrency,
    formatDateTime,
    formatDuration,
    formatLots,
    formatPrice,
    formatR,
} from '../../utils/format';

interface Props {
    trades: Trade[];
    priceDecimals?: number;
}

type SortKey = 'id' | 'entryTimestamp' | 'pips' | 'pnlAbsolute' | 'rMultiple' | 'holdingPeriodMs';

export function TradeList({ trades, priceDecimals = 2 }: Props) {
    const [sortKey, setSortKey] = useState<SortKey>('id');
    const [sortAsc, setSortAsc] = useState(true);
    const [page, setPage] = useState(0);
    const perPage = 15;

    const sorted = useMemo(() => {
        return [...trades].sort((a, b) => (a[sortKey] - b[sortKey]) * (sortAsc ? 1 : -1));
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
        setPage(0);
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
                    <p className="empty-sub">
                        Loosen the strategy filters, widen the session, or check that risk-based
                        sizing is producing a lot size above the broker minimum.
                    </p>
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
                            <th>Lots</th>
                            <th onClick={() => handleSort('entryTimestamp')}>Entry{sortIcon('entryTimestamp')}</th>
                            <th>Exit</th>
                            <th>Entry</th>
                            <th>Exit</th>
                            <th onClick={() => handleSort('pips')}>Pips{sortIcon('pips')}</th>
                            <th onClick={() => handleSort('rMultiple')}>R{sortIcon('rMultiple')}</th>
                            <th onClick={() => handleSort('pnlAbsolute')}>Net P&amp;L{sortIcon('pnlAbsolute')}</th>
                            <th>MAE / MFE</th>
                            <th onClick={() => handleSort('holdingPeriodMs')}>Held{sortIcon('holdingPeriodMs')}</th>
                            <th>Exit Reason</th>
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
                                <td>{formatLots(trade.lots)}</td>
                                <td className="trade-date">{formatDateTime(trade.entryTimestamp)}</td>
                                <td className="trade-date">{formatDateTime(trade.exitTimestamp)}</td>
                                <td className="trade-price">{formatPrice(trade.entryPrice, priceDecimals)}</td>
                                <td className="trade-price">{formatPrice(trade.exitPrice, priceDecimals)}</td>
                                <td className={`trade-pnl ${trade.pips >= 0 ? 'positive' : 'negative'}`}>
                                    {trade.pips >= 0 ? '+' : ''}{trade.pips.toFixed(1)}
                                </td>
                                <td className={`trade-pnl ${trade.rMultiple >= 0 ? 'positive' : 'negative'}`}>
                                    {trade.riskPips > 0 ? formatR(trade.rMultiple) : '—'}
                                </td>
                                <td className={`trade-pnl ${trade.pnlAbsolute >= 0 ? 'positive' : 'negative'}`}>
                                    {formatSignedCurrency(trade.pnlAbsolute)}
                                </td>
                                <td className="trade-price">
                                    {trade.maePips.toFixed(1)} / +{trade.mfePips.toFixed(1)}
                                </td>
                                <td className="trade-duration">{formatDuration(trade.holdingPeriodMs)}</td>
                                <td className="trade-duration">{trade.exitReason}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {pageCount > 1 && (
                <div className="trade-pagination">
                    <button disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
                    <span>Page {page + 1} of {pageCount}</span>
                    <button disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next →</button>
                </div>
            )}
        </div>
    );
}
