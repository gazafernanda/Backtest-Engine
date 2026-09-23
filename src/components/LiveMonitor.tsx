import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle } from '../types';
import { DEFAULT_INSTRUMENT } from '../engine/instrument';
import { scanSignals, resolveOutcome, type LiveSignal } from '../engine/liveSignal';
import { fetchCandles, hasApiKey } from '../data/twelvedata';
import { usedToday, quotaState, DAILY_LIMIT, HARD_LIMIT } from '../data/quota';
import { SignalChart } from './SignalChart';
import { formatDateTime, formatPrice } from '../utils/format';

const SYMBOL = 'XAU/USD';
const INTERVAL = '1min';
const BARS = 500;

/**
 * Polling cadence.
 *
 * The free Twelve Data tier is REST only — there is no stream to subscribe to,
 * so "live" means polling as fast as the daily budget allows. 800 requests a day
 * spread evenly would be one every 108 seconds, which feels dead.
 *
 * Instead: poll fast while you are actually looking at the chart, and spend
 * nothing at all when the tab is hidden. An hour of watching costs 240 requests;
 * a day of ignoring it costs none.
 */
const POLL_ACTIVE_MS = 15_000;
/** Cadence once the day's budget is nearly gone. */
const POLL_SLOW_MS = 120_000;
/** Cached candles older than this are refetched — must be under the poll rate. */
const CACHE_MS = 5_000;

export function LiveMonitor() {
    const [candles, setCandles] = useState<Candle[]>([]);
    const [signals, setSignals] = useState<LiveSignal[]>([]);
    const [lastUpdate, setLastUpdate] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [synthetic, setSynthetic] = useState(false);
    const [loading, setLoading] = useState(true);
    const [paused, setPaused] = useState(false);
    const [used, setUsed] = useState(0);
    const [, forceTick] = useState(0);

    const spec = DEFAULT_INSTRUMENT;
    const inFlight = useRef(false);

    const poll = useCallback(async () => {
        if (inFlight.current) return;
        if (quotaState() === 'exhausted') {
            setUsed(usedToday());
            return;
        }
        inFlight.current = true;

        try {
            const res = await fetchCandles({
                symbol: SYMBOL,
                interval: INTERVAL,
                outputsize: BARS,
                cacheMs: CACHE_MS,
            });

            setCandles(res.candles);
            setSignals(scanSignals(res.candles, spec));
            setSynthetic(res.isSynthetic);
            setError(res.isSynthetic && res.notice ? res.notice : null);
            setLastUpdate(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load prices');
        } finally {
            setUsed(usedToday());
            setLoading(false);
            inFlight.current = false;
        }
    }, [spec]);

    // Poll only while the tab is visible — a hidden chart nobody is reading is
    // the cheapest thing to stop.
    useEffect(() => {
        let timer: number | undefined;

        const schedule = () => {
            window.clearInterval(timer);
            const rate = quotaState() === 'ok' ? POLL_ACTIVE_MS : POLL_SLOW_MS;
            timer = window.setInterval(poll, rate);
        };

        const onVisibility = () => {
            if (document.hidden) {
                window.clearInterval(timer);
                setPaused(true);
            } else {
                setPaused(false);
                poll();
                schedule();
            }
        };

        if (!document.hidden) {
            poll();
            schedule();
        } else {
            setPaused(true);
        }

        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [poll]);

    // Repaint once a second so the freshness readout counts up.
    useEffect(() => {
        const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
        return () => window.clearInterval(id);
    }, []);

    const active = signals[0] ?? null;
    const activeOutcome = active ? resolveOutcome(active, candles) : null;
    const last = candles.length > 0 ? candles[candles.length - 1] : null;
    const price = last?.close ?? null;

    const ageSeconds = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : null;
    const quota = quotaState();

    let statusText: string;
    if (loading) statusText = 'Loading…';
    else if (paused) statusText = 'Paused — tab not visible';
    else if (quota === 'exhausted') statusText = `Daily budget spent (${used}/${DAILY_LIMIT})`;
    else if (ageSeconds !== null) statusText = `Updated ${ageSeconds}s ago`;
    else statusText = 'Waiting';

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
                    <span
                        className={`live-dot ${loading ? 'busy' : paused || quota === 'exhausted' ? 'warn' : synthetic ? 'warn' : 'ok'
                            }`}
                    />
                    {statusText}
                    <span className="live-quota" title={`Requests used today, out of ${DAILY_LIMIT}`}>
                        {used}/{DAILY_LIMIT}
                    </span>
                </div>
            </header>

            {!hasApiKey() && (
                <div className="live-banner">
                    <strong>No API key.</strong> Add <code>VITE_TWELVEDATA_API_KEY</code> to your{' '}
                    <code>.env</code> and restart — until then these are generated prices, not gold.
                </div>
            )}

            {quota === 'exhausted' && hasApiKey() && (
                <div className="live-banner">
                    <strong>Daily budget spent.</strong> {used} of {DAILY_LIMIT} free requests used
                    ({HARD_LIMIT} is the cut-off, leaving headroom for the alert bot). Polling
                    resumes at 00:00 UTC.
                </div>
            )}

            {error && !synthetic && <div className="live-banner error">{error}</div>}
            {synthetic && hasApiKey() && <div className="live-banner">{error}</div>}

            <div className="live-chart-wrap">
                <SignalChart candles={candles} signal={active} priceDecimals={spec.priceDecimals} />
            </div>

            {last && (
                <p className="live-footnote">
                    Last bar {formatDateTime(last.timestamp)} UTC · polling every{' '}
                    {(quota === 'ok' ? POLL_ACTIVE_MS : POLL_SLOW_MS) / 1000}s while this tab is
                    visible, paused when it is not.
                </p>
            )}

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
