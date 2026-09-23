import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle } from '../types';
import { DEFAULT_INSTRUMENT } from '../engine/instrument';
import { scanSignals, resolveOutcome, type LiveSignal } from '../engine/liveSignal';
import { fetchCandles, hasApiKey } from '../data/twelvedata';
import { SignalChart } from './SignalChart';
import { formatDateTime, formatPrice } from '../utils/format';

const SYMBOL = 'XAU/USD';
const INTERVAL = '1min';
const BARS = 500;

/**
 * Polling cadence.
 *
 * The free Twelve Data tier allows 800 requests a day. At one request every two
 * minutes this run costs 720 a day, which fits with room to spare. Polling once
 * a minute would blow the daily budget before the session ended.
 */
const POLL_MS = 120_000;

export function LiveMonitor() {
    const [candles, setCandles] = useState<Candle[]>([]);
    const [signals, setSignals] = useState<LiveSignal[]>([]);
    const [lastUpdate, setLastUpdate] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [synthetic, setSynthetic] = useState(false);
    const [loading, setLoading] = useState(true);
    const [secondsToNext, setSecondsToNext] = useState(POLL_MS / 1000);

    const spec = DEFAULT_INSTRUMENT;
    // Guards against two polls overlapping if one request runs long.
    const inFlight = useRef(false);

    const poll = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;

        try {
            const res = await fetchCandles({
                symbol: SYMBOL,
                interval: INTERVAL,
                outputsize: BARS,
            });

            setCandles(res.candles);
            setSignals(scanSignals(res.candles, spec));
            setSynthetic(res.isSynthetic);
            setError(res.isSynthetic && res.notice ? res.notice : null);
            setLastUpdate(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load prices');
        } finally {
            setLoading(false);
            setSecondsToNext(POLL_MS / 1000);
            inFlight.current = false;
        }
    }, [spec]);

    useEffect(() => {
        poll();
        const id = window.setInterval(poll, POLL_MS);
        return () => window.clearInterval(id);
    }, [poll]);

    // Countdown, purely cosmetic — the interval above does the real work.
    useEffect(() => {
        const id = window.setInterval(() => {
            setSecondsToNext((s) => (s > 0 ? s - 1 : 0));
        }, 1000);
        return () => window.clearInterval(id);
    }, []);

    const active = signals[0] ?? null;
    const activeOutcome = active ? resolveOutcome(active, candles) : null;
    const price = candles.length > 0 ? candles[candles.length - 1].close : null;

    return (
        <div className="live-layout">
            <header className="live-header">
                <div className="live-title">
                    <h1>XAU/USD</h1>
                    <span className="live-interval">M1 · price action</span>
                </div>

                <div className="live-price">
                    {price !== null ? formatPrice(price, spec.priceDecimals) : '—'}
                </div>

                <div className="live-status">
                    <span className={`live-dot ${loading ? 'busy' : synthetic ? 'warn' : 'ok'}`} />
                    {loading
                        ? 'Loading…'
                        : lastUpdate
                            ? `Updated ${formatDateTime(lastUpdate)} UTC · next in ${secondsToNext}s`
                            : 'Waiting'}
                </div>
            </header>

            {!hasApiKey() && (
                <div className="live-banner">
                    <strong>No API key.</strong> Add <code>VITE_TWELVEDATA_API_KEY</code> to your{' '}
                    <code>.env</code> and restart — until then these are generated prices, not gold.
                </div>
            )}

            {error && !synthetic && <div className="live-banner error">{error}</div>}
            {synthetic && hasApiKey() && <div className="live-banner">{error}</div>}

            <div className="live-chart-wrap">
                <SignalChart candles={candles} signal={active} priceDecimals={spec.priceDecimals} />
            </div>

            {active ? (
                <section className="setup-card">
                    <div className="setup-head">
                        <span className={`setup-side ${active.side}`}>{active.side.toUpperCase()}</span>
                        <span className="setup-strategy">{active.strategy}</span>
                        {activeOutcome && (
                            <span className={`setup-outcome ${activeOutcome.outcome.replace(' ', '-')}`}>
                                {activeOutcome.outcome}
                            </span>
                        )}
                    </div>

                    <div className="setup-levels">
                        <div className="setup-level entry">
                            <span>Entry</span>
                            <strong>{formatPrice(active.entry, spec.priceDecimals)}</strong>
                        </div>
                        <div className="setup-level stop">
                            <span>Stop loss</span>
                            <strong>{formatPrice(active.stop, spec.priceDecimals)}</strong>
                            <em>{active.riskPips.toFixed(1)} pips</em>
                        </div>
                        <div className="setup-level target">
                            <span>Take profit</span>
                            <strong>{formatPrice(active.target, spec.priceDecimals)}</strong>
                            <em>{active.rewardPips.toFixed(1)} pips</em>
                        </div>
                        <div className="setup-level rr">
                            <span>Risk : Reward</span>
                            <strong>1 : {active.riskReward.toFixed(2)}</strong>
                        </div>
                    </div>

                    <p className="setup-reason">
                        {active.reason} · {formatDateTime(active.timestamp)} UTC
                    </p>
                </section>
            ) : (
                !loading && (
                    <section className="setup-card empty">
                        No setup on the last {BARS} bars. The chart keeps updating; a signal will
                        appear here when one forms.
                    </section>
                )
            )}

            {signals.length > 1 && (
                <section className="signal-history">
                    <h2>Earlier signals</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Time (UTC)</th>
                                <th>Side</th>
                                <th>Strategy</th>
                                <th>Entry</th>
                                <th>SL</th>
                                <th>TP</th>
                                <th>R:R</th>
                                <th>Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {signals.slice(1).map((s) => {
                                const o = resolveOutcome(s, candles);
                                return (
                                    <tr key={s.id}>
                                        <td>{formatDateTime(s.timestamp)}</td>
                                        <td className={`side ${s.side}`}>{s.side.toUpperCase()}</td>
                                        <td>{s.strategy}</td>
                                        <td>{formatPrice(s.entry, spec.priceDecimals)}</td>
                                        <td>{formatPrice(s.stop, spec.priceDecimals)}</td>
                                        <td>{formatPrice(s.target, spec.priceDecimals)}</td>
                                        <td>1:{s.riskReward.toFixed(1)}</td>
                                        <td className={`outcome ${o.outcome.replace(' ', '-')}`}>
                                            {o.outcome}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}
