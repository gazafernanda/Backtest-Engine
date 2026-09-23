import React from 'react';
import { AppProvider, useAppState } from './context/AppContext';
import { ConfigPanel } from './components/Controls/ConfigPanel';
import { MetricsCards } from './components/Dashboard/MetricsCards';
import { EquityCurve } from './components/Charts/EquityCurve';
import { DrawdownChart } from './components/Charts/DrawdownChart';
import { TradeList } from './components/Dashboard/TradeList';
import { MonthlyBreakdown } from './components/Dashboard/MonthlyBreakdown';
import { StrategyComparison } from './components/Dashboard/StrategyComparison';
import './App.css';

function Dashboard() {
    const { state } = useAppState();
    const activeResult =
        state.activeResultIndex >= 0 && state.activeResultIndex < state.results.length
            ? state.results[state.activeResultIndex]
            : null;

    return (
        <div className="app-layout">
            {/* Sidebar */}
            <aside className="sidebar">
                <ConfigPanel />
            </aside>

            {/* Main Content */}
            <main className="main-content">
                {/* Header */}
                <header className="app-header">
                    <div className="header-left">
                        <div className="header-logo">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="url(#headerGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <defs>
                                    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#00d4ff" />
                                        <stop offset="100%" stopColor="#00e676" />
                                    </linearGradient>
                                </defs>
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                            <h1>Gold Backtester</h1>
                        </div>
                        <p className="header-sub">XAU/USD Price Action Backtesting Engine</p>
                    </div>
                    <div className="header-right">
                        <div className="header-stat">
                            <span className="header-stat-label">Strategies Tested</span>
                            <span className="header-stat-value">{state.results.length}</span>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                {!activeResult && !state.isLoading ? (
                    <div className="welcome-screen">
                        <div className="welcome-icon">
                            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <h2>Ready to Backtest</h2>
                        <p>Configure your strategy in the sidebar and click <strong>Run Backtest</strong> to start.</p>
                        <div className="welcome-features">
                            <div className="welcome-feature">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>
                                <span>5 Price Action Strategies</span>
                            </div>
                            <div className="welcome-feature">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                                <span>M1 → D1 Timeframes</span>
                            </div>
                            <div className="welcome-feature">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                <span>Lot &amp; Pip Accounting</span>
                            </div>
                        </div>
                    </div>
                ) : state.isLoading ? (
                    <div className="loading-screen">
                        <div className="loading-spinner-large" />
                        <h3>Running Backtest...</h3>
                        <p>Fetching data & simulating trades</p>
                    </div>
                ) : activeResult ? (
                    <div className="dashboard-content">
                        {/* Result Header */}
                        <div className="result-header">
                            <div className="result-title">
                                <h2>{activeResult.strategyName}</h2>
                                <span className="result-meta">
                                    {activeResult.symbol} · {activeResult.interval} ·{' '}
                                    {activeResult.barCount} bars · {activeResult.trades.length} trades
                                </span>
                            </div>
                        </div>

                        {activeResult.isSyntheticData && (
                            <div className="synthetic-banner">
                                <strong>Generated data.</strong> This run did not use real gold
                                prices, so the numbers below are a demonstration of the engine — not
                                a backtest result. Add a Twelve Data API key and run again.
                            </div>
                        )}

                        {/* Metrics */}
                        <MetricsCards metrics={activeResult.metrics} />

                        {/* Charts */}
                        <div className="charts-row">
                            <EquityCurve
                                equityCurve={activeResult.equityCurve}
                                trades={activeResult.trades}
                                initialCapital={activeResult.config.initialCapital}
                            />
                        </div>

                        <DrawdownChart
                            equityCurve={activeResult.equityCurve}
                            initialCapital={activeResult.config.initialCapital}
                        />

                        {/* Strategy Comparison (only when 2+ results) */}
                        <StrategyComparison results={state.results} />

                        {/* Trade List & Monthly Breakdown */}
                        <div className="data-row">
                            <TradeList
                                trades={activeResult.trades}
                                priceDecimals={activeResult.symbol === 'XAG/USD' ? 3 : 2}
                            />
                            <MonthlyBreakdown monthlyBreakdown={activeResult.monthlyBreakdown} />
                        </div>
                    </div>
                ) : null}
            </main>
        </div>
    );
}

export default function App() {
    return (
        <AppProvider>
            <Dashboard />
        </AppProvider>
    );
}
