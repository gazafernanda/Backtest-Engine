import React from 'react';
import { useAppState } from '../../context/AppContext';
import { SUPPORTED_COINS } from '../../types';
import { STRATEGIES } from '../../engine/strategies';
import { fetchOHLC } from '../../data/coingecko';
import { runBacktest } from '../../engine/backtest';

const DAYS_OPTIONS = [
    { value: 7, label: '7 Days' },
    { value: 14, label: '14 Days' },
    { value: 30, label: '30 Days' },
    { value: 90, label: '90 Days' },
    { value: 180, label: '180 Days' },
    { value: 365, label: '365 Days' },
];

export function ConfigPanel() {
    const { state, dispatch } = useAppState();

    const currentStrategyFactory = STRATEGIES[state.strategyKey];
    const currentStrategy = currentStrategyFactory ? currentStrategyFactory() : null;

    async function handleRunBacktest() {
        dispatch({ type: 'SET_LOADING', isLoading: true });
        dispatch({ type: 'SET_ERROR', error: null });

        try {
            const candles = await fetchOHLC(state.coinId, state.days);

            if (candles.length === 0) {
                throw new Error('No candle data received. Try a different coin or timeframe.');
            }

            const result = runBacktest(
                candles,
                state.strategyKey,
                state.strategyParams,
                state.config,
                state.coinId,
                state.days,
            );

            dispatch({ type: 'ADD_RESULT', result });
        } catch (error) {
            dispatch({
                type: 'SET_ERROR',
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            });
        } finally {
            dispatch({ type: 'SET_LOADING', isLoading: false });
        }
    }

    function handleStrategyChange(key: string) {
        const factory = STRATEGIES[key];
        if (factory) {
            const s = factory();
            const defaults: Record<string, number> = {};
            s.paramDefs.forEach((p) => (defaults[p.key] = p.default));
            dispatch({ type: 'SET_STRATEGY', strategyKey: key, params: defaults });
        }
    }

    return (
        <div className="config-panel">
            <div className="config-header">
                <div className="config-logo">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <h2>Configuration</h2>
                </div>
            </div>

            <div className="config-section">
                <label className="config-label">Asset</label>
                <select
                    className="config-select"
                    value={state.coinId}
                    onChange={(e) => dispatch({ type: 'SET_COIN', coinId: e.target.value })}
                >
                    {SUPPORTED_COINS.map((coin) => (
                        <option key={coin.id} value={coin.id}>
                            {coin.symbol} — {coin.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="config-section">
                <label className="config-label">Timeframe</label>
                <div className="config-chips">
                    {DAYS_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            className={`config-chip ${state.days === opt.value ? 'active' : ''}`}
                            onClick={() => dispatch({ type: 'SET_DAYS', days: opt.value })}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="config-section">
                <label className="config-label">Strategy</label>
                <select
                    className="config-select"
                    value={state.strategyKey}
                    onChange={(e) => handleStrategyChange(e.target.value)}
                >
                    {Object.entries(STRATEGIES).map(([key, factory]) => {
                        const s = factory();
                        return (
                            <option key={key} value={key}>
                                {s.name}
                            </option>
                        );
                    })}
                </select>
                {currentStrategy && (
                    <p className="config-description">{currentStrategy.description}</p>
                )}
            </div>

            {currentStrategy && currentStrategy.paramDefs.length > 0 && (
                <div className="config-section">
                    <label className="config-label">Strategy Parameters</label>
                    {currentStrategy.paramDefs.map((param) => (
                        <div key={param.key} className="config-param">
                            <div className="config-param-header">
                                <span className="config-param-label">{param.label}</span>
                                <span className="config-param-value">
                                    {state.strategyParams[param.key] ?? param.default}
                                </span>
                            </div>
                            <input
                                type="range"
                                className="config-slider"
                                min={param.min}
                                max={param.max}
                                step={param.step}
                                value={state.strategyParams[param.key] ?? param.default}
                                onChange={(e) =>
                                    dispatch({
                                        type: 'SET_STRATEGY_PARAMS',
                                        params: { [param.key]: Number(e.target.value) },
                                    })
                                }
                            />
                            <div className="config-param-range">
                                <span>{param.min}</span>
                                <span>{param.max}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="config-section">
                <label className="config-label">Trading Settings</label>

                <div className="config-input-group">
                    <label>Initial Capital ($)</label>
                    <input
                        type="number"
                        className="config-input"
                        value={state.config.initialCapital}
                        onChange={(e) =>
                            dispatch({ type: 'SET_CONFIG', config: { initialCapital: Number(e.target.value) } })
                        }
                    />
                </div>

                <div className="config-input-group">
                    <label>Commission (%)</label>
                    <input
                        type="number"
                        className="config-input"
                        step="0.01"
                        value={state.config.commissionPercent}
                        onChange={(e) =>
                            dispatch({
                                type: 'SET_CONFIG',
                                config: { commissionPercent: Number(e.target.value) },
                            })
                        }
                    />
                </div>

                <div className="config-input-group">
                    <label>Slippage (%)</label>
                    <input
                        type="number"
                        className="config-input"
                        step="0.01"
                        value={state.config.slippagePercent}
                        onChange={(e) =>
                            dispatch({
                                type: 'SET_CONFIG',
                                config: { slippagePercent: Number(e.target.value) },
                            })
                        }
                    />
                </div>

                <div className="config-input-group">
                    <label>Stop Loss (%, 0 = off)</label>
                    <input
                        type="number"
                        className="config-input"
                        step="0.5"
                        value={state.config.stopLossPercent || 0}
                        onChange={(e) =>
                            dispatch({
                                type: 'SET_CONFIG',
                                config: { stopLossPercent: Number(e.target.value) },
                            })
                        }
                    />
                </div>

                <div className="config-input-group">
                    <label>Take Profit (%, 0 = off)</label>
                    <input
                        type="number"
                        className="config-input"
                        step="0.5"
                        value={state.config.takeProfitPercent || 0}
                        onChange={(e) =>
                            dispatch({
                                type: 'SET_CONFIG',
                                config: { takeProfitPercent: Number(e.target.value) },
                            })
                        }
                    />
                </div>
            </div>

            <button
                className="config-run-btn"
                onClick={handleRunBacktest}
                disabled={state.isLoading}
            >
                {state.isLoading ? (
                    <>
                        <span className="spinner" />
                        Running Backtest...
                    </>
                ) : (
                    <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Run Backtest
                    </>
                )}
            </button>

            {state.error && <div className="config-error">{state.error}</div>}

            {state.results.length > 1 && (
                <div className="config-section">
                    <label className="config-label">Results History</label>
                    <div className="config-results-list">
                        {state.results.map((r, i) => (
                            <button
                                key={i}
                                className={`config-result-item ${state.activeResultIndex === i ? 'active' : ''}`}
                                onClick={() => dispatch({ type: 'SET_ACTIVE_RESULT', index: i })}
                            >
                                <span className="result-name">{r.strategyName}</span>
                                <span className="result-coin">
                                    {SUPPORTED_COINS.find((c) => c.id === r.coinId)?.symbol || r.coinId}
                                </span>
                                <span
                                    className={`result-return ${r.metrics.totalReturnPercent >= 0 ? 'positive' : 'negative'}`}
                                >
                                    {r.metrics.totalReturnPercent >= 0 ? '+' : ''}
                                    {r.metrics.totalReturnPercent.toFixed(2)}%
                                </span>
                            </button>
                        ))}
                    </div>
                    <button
                        className="config-clear-btn"
                        onClick={() => dispatch({ type: 'CLEAR_RESULTS' })}
                    >
                        Clear All Results
                    </button>
                </div>
            )}
        </div>
    );
}
