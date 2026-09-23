import React from 'react';
import { useAppState } from '../../context/AppContext';
import {
    SUPPORTED_SYMBOLS,
    TIMEFRAMES,
    BAR_COUNT_OPTIONS,
    type SessionFilter,
    type SizingMode,
} from '../../types';
import { STRATEGIES } from '../../engine/strategies';
import { fetchCandles, hasApiKey } from '../../data/twelvedata';
import { runBacktest } from '../../engine/backtest';

const SESSIONS: { value: SessionFilter; label: string }[] = [
    { value: 'all', label: 'All hours' },
    { value: 'asia', label: 'Asia (00–08 UTC)' },
    { value: 'london', label: 'London (07–16 UTC)' },
    { value: 'newYork', label: 'New York (12–21 UTC)' },
    { value: 'londonNewYork', label: 'London + NY (07–21 UTC)' },
];

export function ConfigPanel() {
    const { state, dispatch } = useAppState();

    const currentStrategy = STRATEGIES[state.strategyKey]?.() ?? null;

    async function handleRunBacktest() {
        dispatch({ type: 'SET_LOADING', isLoading: true });
        dispatch({ type: 'SET_ERROR', error: null });
        dispatch({ type: 'SET_WARNING', warning: null });

        try {
            const { candles, isSynthetic, notice } = await fetchCandles({
                symbol: state.symbol,
                interval: state.interval,
                outputsize: state.barCount,
            });

            if (candles.length === 0) {
                throw new Error('No candles returned. Try a different timeframe or bar count.');
            }
            if (notice) {
                dispatch({ type: 'SET_WARNING', warning: notice });
            }

            const result = runBacktest(
                candles,
                state.strategyKey,
                state.strategyParams,
                state.config,
                state.symbol,
                state.interval,
                isSynthetic,
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
        if (!factory) return;
        const defaults: Record<string, number> = {};
        factory().paramDefs.forEach((p) => (defaults[p.key] = p.default));
        dispatch({ type: 'SET_STRATEGY', strategyKey: key, params: defaults });
    }

    const numberField = (
        label: string,
        value: number,
        onChange: (n: number) => void,
        step = 0.1,
    ) => (
        <div className="config-input-group">
            <label>{label}</label>
            <input
                type="number"
                className="config-input"
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </div>
    );

    return (
        <div className="config-panel">
            <div className="config-header">
                <div className="config-logo">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="8" />
                        <path d="M12 8v8M9.5 10h5M9.5 14h5" />
                    </svg>
                    <h2>Configuration</h2>
                </div>
            </div>

            {!hasApiKey() && (
                <div className="config-warning">
                    No API key found. Copy <code>.env.example</code> to <code>.env</code>, add a free
                    Twelve Data key, and restart the dev server. Until then, runs use generated data.
                </div>
            )}

            {/* ── Market ─────────────────────────────────── */}
            <div className="config-section">
                <label className="config-label">Instrument</label>
                <select
                    className="config-select"
                    value={state.symbol}
                    onChange={(e) => dispatch({ type: 'SET_SYMBOL', symbol: e.target.value })}
                >
                    {SUPPORTED_SYMBOLS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                </select>
            </div>

            <div className="config-section">
                <label className="config-label">Timeframe</label>
                <div className="config-chips">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf.value}
                            className={`config-chip ${state.interval === tf.value ? 'active' : ''}`}
                            onClick={() => dispatch({ type: 'SET_INTERVAL', interval: tf.value })}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="config-section">
                <label className="config-label">History Depth</label>
                <div className="config-chips">
                    {BAR_COUNT_OPTIONS.map((n) => (
                        <button
                            key={n}
                            className={`config-chip ${state.barCount === n ? 'active' : ''}`}
                            onClick={() => dispatch({ type: 'SET_BAR_COUNT', barCount: n })}
                        >
                            {n} bars
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Strategy ───────────────────────────────── */}
            <div className="config-section">
                <label className="config-label">Price Action Strategy</label>
                <select
                    className="config-select"
                    value={state.strategyKey}
                    onChange={(e) => handleStrategyChange(e.target.value)}
                >
                    {Object.entries(STRATEGIES).map(([key, factory]) => (
                        <option key={key} value={key}>{factory().name}</option>
                    ))}
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

            {/* ── Session ────────────────────────────────── */}
            <div className="config-section">
                <label className="config-label">Entry Session</label>
                <select
                    className="config-select"
                    value={state.config.sessionFilter}
                    onChange={(e) =>
                        dispatch({
                            type: 'SET_CONFIG',
                            config: { sessionFilter: e.target.value as SessionFilter },
                        })
                    }
                >
                    {SESSIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                </select>
                <p className="config-description">
                    Filters new entries only. Trades already open are still managed around the clock.
                </p>
            </div>

            {/* ── Sizing ─────────────────────────────────── */}
            <div className="config-section">
                <label className="config-label">Position Sizing</label>
                <div className="config-chips">
                    {(['riskPercent', 'fixedLot'] as SizingMode[]).map((mode) => (
                        <button
                            key={mode}
                            className={`config-chip ${state.config.sizingMode === mode ? 'active' : ''}`}
                            onClick={() => dispatch({ type: 'SET_CONFIG', config: { sizingMode: mode } })}
                        >
                            {mode === 'riskPercent' ? '% Risk' : 'Fixed Lot'}
                        </button>
                    ))}
                </div>

                {numberField('Initial Capital ($)', state.config.initialCapital, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { initialCapital: n } }), 100)}

                {state.config.sizingMode === 'riskPercent'
                    ? numberField('Risk per Trade (%)', state.config.riskPercent, (n) =>
                        dispatch({ type: 'SET_CONFIG', config: { riskPercent: n } }), 0.1)
                    : numberField('Lot Size', state.config.fixedLot, (n) =>
                        dispatch({ type: 'SET_CONFIG', config: { fixedLot: n } }), 0.01)}

                {state.config.sizingMode === 'riskPercent' && (
                    <p className="config-description">
                        Trades without a stop are skipped — risk-based sizing needs a defined
                        invalidation level.
                    </p>
                )}
            </div>

            {/* ── Dealing costs ──────────────────────────── */}
            <div className="config-section">
                <label className="config-label">Dealing Costs</label>
                {numberField('Spread (pips)', state.config.spreadPips, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { spreadPips: n } }), 0.1)}
                {numberField('Commission ($ / lot / side)', state.config.commissionPerLot, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { commissionPerLot: n } }), 0.5)}
                {numberField('Slippage (pips)', state.config.slippagePips, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { slippagePips: n } }), 0.1)}
                <p className="config-description">
                    Gold: 1 pip = $0.10 of price, worth $10 per 1.00 lot.
                </p>
            </div>

            {/* ── Risk management ────────────────────────── */}
            <div className="config-section">
                <label className="config-label">Risk Management</label>
                {numberField('Stop Loss (pips, 0 = structural)', state.config.stopLossPips, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { stopLossPips: n } }), 1)}
                {numberField('Take Profit (pips, 0 = strategy target)', state.config.takeProfitPips, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { takeProfitPips: n } }), 1)}
                {numberField('Break-even Trigger (pips, 0 = off)', state.config.breakEvenPips, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { breakEvenPips: n } }), 1)}
                <p className="config-description">
                    At 0, each strategy's own structural stop and target are used.
                </p>
            </div>

            {/* ── Account ────────────────────────────────── */}
            <div className="config-section">
                <label className="config-label">Account &amp; Financing</label>
                {numberField('Leverage (1 : N)', state.config.leverage, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { leverage: n } }), 10)}
                {numberField('Stop-out Level (%)', state.config.stopOutLevel, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { stopOutLevel: n } }), 5)}
                {numberField('Swap Long ($ / lot / night)', state.config.swapLongPerLot, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { swapLongPerLot: n } }), 0.5)}
                {numberField('Swap Short ($ / lot / night)', state.config.swapShortPerLot, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { swapShortPerLot: n } }), 0.5)}
            </div>

            <button className="config-run-btn" onClick={handleRunBacktest} disabled={state.isLoading}>
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
            {state.warning && <div className="config-warning">{state.warning}</div>}

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
                                <span className="result-coin">{r.interval}</span>
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
