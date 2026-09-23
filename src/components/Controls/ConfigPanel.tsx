import React, { useState } from 'react';
import { useAppState } from '../../context/AppContext';
import {
    SUPPORTED_SYMBOLS,
    TIMEFRAMES,
    BAR_COUNT_OPTIONS,
    type SessionFilter,
    type SizingMode,
} from '../../types';
import { RISK_PROFILES, deriveConfig, type RiskProfile } from '../../engine/autoConfig';
import { STRATEGIES } from '../../engine/strategies';
import { fetchCandles, getApiKey, setApiKey, clearCache } from '../../data/twelvedata';
import { runBacktest } from '../../engine/backtest';

const SESSIONS: { value: SessionFilter; label: string }[] = [
    { value: 'all', label: 'All hours' },
    { value: 'asia', label: 'Asia (00–08 UTC)' },
    { value: 'london', label: 'London (07–16 UTC)' },
    { value: 'newYork', label: 'New York (12–21 UTC)' },
    { value: 'londonNewYork', label: 'London + NY (07–21 UTC)' },
];

const SIZING_LABEL: Record<SizingMode, string> = {
    riskPercent: '% Risk',
    fixedLot: 'Fixed Lot',
};

export function ConfigPanel() {
    const { state, dispatch } = useAppState();
    const [keyInput, setKeyInput] = useState(getApiKey());
    const [keySaved, setKeySaved] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const currentStrategy = STRATEGIES[state.strategyKey]?.() ?? null;
    const derived = deriveConfig(state.riskProfile, state.config.initialCapital, state.interval);
    const activeProfile = RISK_PROFILES.find((p) => p.value === state.riskProfile);

    function handleSaveKey() {
        setApiKey(keyInput);
        // Cached candles were fetched under the previous key (or none at all).
        clearCache();
        setKeySaved(true);
        dispatch({ type: 'SET_WARNING', warning: null });
        window.setTimeout(() => setKeySaved(false), 2500);
    }

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
        disabled = false,
    ) => (
        <div className="config-input-group">
            <label>{label}</label>
            <input
                type="number"
                className="config-input"
                step={step}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </div>
    );

    /** Advanced fields are read-only while the config is being derived. */
    const advField = (
        label: string,
        value: number,
        onChange: (n: number) => void,
        step = 0.1,
    ) => numberField(label, value, onChange, step, state.autoMode);

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

            <div className="config-section">
                <label className="config-label">Twelve Data API Key</label>
                <div className="config-input-group">
                    <input
                        type="password"
                        className="config-input"
                        placeholder="Paste your free API key"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
                <button className="config-clear-btn" onClick={handleSaveKey}>
                    {keySaved ? 'Saved' : keyInput.trim() ? 'Save Key' : 'Clear Key'}
                </button>
                {!getApiKey() && (
                    <div className="config-warning">
                        No key set — runs will use <strong>generated</strong> data. Get a free one at{' '}
                        <a href="https://twelvedata.com/apikey" target="_blank" rel="noreferrer">
                            twelvedata.com/apikey
                        </a>
                        .
                    </div>
                )}
                <p className="config-description">
                    Stored only in this browser. It is never sent anywhere except Twelve Data, and
                    never committed or deployed.
                </p>
            </div>

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

            {/* ── Account size ───────────────────────────── */}
            <div className="config-section">
                <label className="config-label">Account Size</label>
                {numberField('Starting balance ($)', state.config.initialCapital, (n) =>
                    dispatch({ type: 'SET_CONFIG', config: { initialCapital: n } }), 100)}
            </div>

            {/* ── Risk appetite ──────────────────────────── */}
            <div className="config-section">
                <label className="config-label">How much to risk</label>
                <div className="config-chips">
                    {RISK_PROFILES.map((p) => (
                        <button
                            key={p.value}
                            className={`config-chip ${state.riskProfile === p.value ? 'active' : ''}`}
                            onClick={() =>
                                dispatch({ type: 'SET_RISK_PROFILE', riskProfile: p.value as RiskProfile })
                            }
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                {activeProfile && <p className="config-description">{activeProfile.blurb}</p>}
            </div>

            {/* ── What was chosen automatically ──────────── */}
            {state.autoMode && (
                <div className="config-section">
                    <label className="config-label">Set for you</label>
                    <dl className="auto-summary">
                        {derived.rationale.map((r) => (
                            <div key={r.label} className="auto-summary-row">
                                <dt title={r.why}>{r.label}</dt>
                                <dd title={r.why}>{r.value}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="config-description">
                        Derived from your account size, risk choice and timeframe. Hover any row for
                        the reasoning.
                    </p>
                </div>
            )}

            {/* ── Advanced (opt-in) ──────────────────────── */}
            <div className="config-section">
                <button
                    className="config-clear-btn"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                >
                    {showAdvanced ? 'Hide advanced settings' : 'Advanced settings'}
                </button>

                {showAdvanced && (
                    <>
                        <div className="config-warning">
                            Editing anything here turns off automatic setup. Switch it back on to
                            return to the derived values.
                        </div>

                        <div className="config-chips">
                            {[true, false].map((on) => (
                                <button
                                    key={String(on)}
                                    className={`config-chip ${state.autoMode === on ? 'active' : ''}`}
                                    onClick={() => dispatch({ type: 'SET_AUTO_MODE', autoMode: on })}
                                >
                                    {on ? 'Automatic' : 'Manual'}
                                </button>
                            ))}
                        </div>

                        <label className="config-label">Entry Session</label>
                        <select
                            className="config-select"
                            value={state.config.sessionFilter}
                            disabled={state.autoMode}
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

                        <label className="config-label">Position Sizing</label>
                        <div className="config-chips">
                            {(['riskPercent', 'fixedLot'] as SizingMode[]).map((mode) => (
                                <button
                                    key={mode}
                                    className={`config-chip ${state.config.sizingMode === mode ? 'active' : ''}`}
                                    disabled={state.autoMode}
                                    onClick={() =>
                                        dispatch({ type: 'SET_CONFIG', config: { sizingMode: mode } })
                                    }
                                >
                                    {SIZING_LABEL[mode]}
                                </button>
                            ))}
                        </div>

                        {state.config.sizingMode === 'riskPercent'
                            ? advField('Risk per Trade (%)', state.config.riskPercent, (n) =>
                                dispatch({ type: 'SET_CONFIG', config: { riskPercent: n } }), 0.1)
                            : advField('Lot Size', state.config.fixedLot, (n) =>
                                dispatch({ type: 'SET_CONFIG', config: { fixedLot: n } }), 0.01)}

                        {advField('Spread (pips)', state.config.spreadPips, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { spreadPips: n } }), 0.1)}
                        {advField('Commission ($ / lot / side)', state.config.commissionPerLot, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { commissionPerLot: n } }), 0.5)}
                        {advField('Slippage (pips)', state.config.slippagePips, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { slippagePips: n } }), 0.1)}

                        {advField('Stop Loss (pips, 0 = structural)', state.config.stopLossPips, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { stopLossPips: n } }), 1)}
                        {advField('Take Profit (pips, 0 = strategy target)', state.config.takeProfitPips, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { takeProfitPips: n } }), 1)}
                        {advField('Break-even Trigger (pips, 0 = off)', state.config.breakEvenPips, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { breakEvenPips: n } }), 1)}

                        {advField('Leverage (1 : N)', state.config.leverage, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { leverage: n } }), 10)}
                        {advField('Stop-out Level (%)', state.config.stopOutLevel, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { stopOutLevel: n } }), 5)}
                        {advField('Swap Long ($ / lot / night)', state.config.swapLongPerLot, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { swapLongPerLot: n } }), 0.5)}
                        {advField('Swap Short ($ / lot / night)', state.config.swapShortPerLot, (n) =>
                            dispatch({ type: 'SET_CONFIG', config: { swapShortPerLot: n } }), 0.5)}
                    </>
                )}
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
