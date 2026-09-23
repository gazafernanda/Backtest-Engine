import type { Candle } from '../types';

/**
 * Market data layer — Twelve Data REST API.
 *
 * Free tier allows 800 requests/day and up to 5000 bars per request, which is
 * ample for single-symbol backtesting.
 *
 * The key comes from the build env (`VITE_TWELVEDATA_API_KEY`, see
 * `.env.example`), which means this app is meant to be run locally. A VITE_
 * variable is inlined into the shipped bundle, so a public deploy built with a
 * key would hand that key to every visitor. The Pages build carries none and
 * therefore runs on generated data.
 *
 * When no key is configured, or the network/API fails, the loader falls back to
 * generated data so the UI still works offline. Callers get `isSynthetic: true`
 * so they can label the result — a backtest on invented data is a demo, not a
 * result, and must never be presented as one.
 */

const API_BASE = 'https://api.twelvedata.com';

const API_KEY: string = (import.meta.env?.VITE_TWELVEDATA_API_KEY ?? '').trim();

export function getApiKey(): string {
    return API_KEY;
}

export interface FetchOptions {
    symbol: string;
    interval: string;
    outputsize: number;
}

export interface CandleResponse {
    candles: Candle[];
    isSynthetic: boolean;
    /** Populated when the live fetch failed and synthetic data was substituted. */
    notice?: string;
}

interface TwelveDataBar {
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
}

interface TwelveDataResponse {
    status?: string;
    code?: number;
    message?: string;
    values?: TwelveDataBar[];
}

export function hasApiKey(): boolean {
    return getApiKey().length > 0;
}

export async function fetchCandles(opts: FetchOptions): Promise<CandleResponse> {
    const cached = getFromCache(opts);
    if (cached) return { candles: cached, isSynthetic: false };

    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            candles: generateSyntheticGold(opts),
            isSynthetic: true,
            notice:
                'No API key set — showing generated data. Add VITE_TWELVEDATA_API_KEY to .env and restart for real gold prices.',
        };
    }

    try {
        const url =
            `${API_BASE}/time_series` +
            `?symbol=${encodeURIComponent(opts.symbol)}` +
            `&interval=${encodeURIComponent(opts.interval)}` +
            `&outputsize=${opts.outputsize}` +
            `&order=ASC` +
            `&timezone=UTC` +
            `&format=JSON` +
            `&apikey=${encodeURIComponent(apiKey)}`;

        const response = await fetch(url);
        const data: TwelveDataResponse = await response.json();

        // Twelve Data reports errors in the body with HTTP 200, so check both.
        if (data.status === 'error' || data.code) {
            throw new Error(data.message || `Twelve Data error ${data.code ?? response.status}`);
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        if (!Array.isArray(data.values) || data.values.length === 0) {
            throw new Error(`No bars returned for ${opts.symbol} @ ${opts.interval}`);
        }

        const candles = data.values
            .map(parseBar)
            .filter((c): c is Candle => c !== null)
            .sort((a, b) => a.timestamp - b.timestamp);

        if (candles.length === 0) {
            throw new Error('All returned bars failed to parse');
        }

        saveToCache(opts, candles);
        return { candles, isSynthetic: false };
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error';
        console.error('Twelve Data fetch failed:', reason);
        return {
            candles: generateSyntheticGold(opts),
            isSynthetic: true,
            notice: `Live data unavailable (${reason}) — showing generated data instead.`,
        };
    }
}

function parseBar(bar: TwelveDataBar): Candle | null {
    const timestamp = parseDatetime(bar.datetime);
    const open = Number(bar.open);
    const high = Number(bar.high);
    const low = Number(bar.low);
    const close = Number(bar.close);

    if (!isFinite(timestamp) || ![open, high, low, close].every(isFinite)) return null;

    const candle: Candle = { timestamp, open, high, low, close };
    if (bar.volume !== undefined) {
        const volume = Number(bar.volume);
        if (isFinite(volume)) candle.volume = volume;
    }
    return candle;
}

/**
 * Twelve Data returns `2026-09-24 01:28:00` for intraday and `2026-09-23` for
 * daily bars. We request `timezone=UTC`, so both are parsed as UTC — letting the
 * browser apply a local offset here would shift every session filter.
 */
function parseDatetime(value: string): number {
    if (!value) return NaN;
    const iso = value.includes(' ') ? value.replace(' ', 'T') : `${value}T00:00:00`;
    return Date.parse(`${iso}Z`);
}

// ─── Cache Layer ─────────────────────────────────────────────

const CACHE_PREFIX = 'xau_ohlc_';

interface CacheEntry {
    timestamp: number;
    data: Candle[];
}

function getCacheKey(opts: FetchOptions): string {
    return `${CACHE_PREFIX}${opts.symbol}_${opts.interval}_${opts.outputsize}`;
}

/** Cache for roughly one bar, so re-runs are free but data stays current. */
function cacheTtlMs(interval: string): number {
    switch (interval) {
        case '1min':
            return 60_000;
        case '5min':
            return 5 * 60_000;
        case '15min':
            return 15 * 60_000;
        case '30min':
            return 30 * 60_000;
        case '1h':
            return 60 * 60_000;
        case '4h':
            return 4 * 60 * 60_000;
        default:
            return 12 * 60 * 60_000;
    }
}

function getFromCache(opts: FetchOptions): Candle[] | null {
    try {
        const raw = localStorage.getItem(getCacheKey(opts));
        if (!raw) return null;

        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > cacheTtlMs(opts.interval)) {
            localStorage.removeItem(getCacheKey(opts));
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

function saveToCache(opts: FetchOptions, data: Candle[]): void {
    try {
        const entry: CacheEntry = { timestamp: Date.now(), data };
        localStorage.setItem(getCacheKey(opts), JSON.stringify(entry));
    } catch {
        // Quota exceeded on a 5000-bar M1 series is expected; caching is optional.
        console.warn('Could not cache candles (localStorage full?)');
    }
}

export function clearCache(): void {
    try {
        Object.keys(localStorage)
            .filter((k) => k.startsWith(CACHE_PREFIX))
            .forEach((k) => localStorage.removeItem(k));
    } catch {
        /* ignore */
    }
}

// ─── Synthetic fallback ──────────────────────────────────────

/**
 * Deterministic random walk shaped like gold: ~$4,300 base, intraday ranges and
 * an occasional trend leg. Weekend bars are skipped so the session filter and
 * swap logic see realistic gaps.
 */
function generateSyntheticGold(opts: FetchOptions): Candle[] {
    const barMs = INTERVAL_MS[opts.interval] ?? 60_000;
    const count = Math.min(opts.outputsize, 5000);
    const rng = mulberry32(0x60_1d);
    const candles: Candle[] = [];

    // Volatility scales with the square root of bar duration.
    const volPerBar = 0.35 * Math.sqrt(barMs / 60_000);

    let price = 4300;
    let momentum = 0;
    let cursor = Date.now() - count * barMs;

    while (candles.length < count) {
        const day = new Date(cursor).getUTCDay();
        if (day === 6 || day === 0) {
            // Skip the weekend close — gold does not trade Sat/Sun.
            cursor += barMs;
            continue;
        }

        momentum = momentum * 0.97 + (rng() - 0.5) * volPerBar * 0.4;
        const open = price;
        const close = open + momentum + (rng() - 0.5) * volPerBar;
        const wickUp = rng() * volPerBar * 0.8;
        const wickDown = rng() * volPerBar * 0.8;

        candles.push({
            timestamp: cursor,
            open: round2(open),
            high: round2(Math.max(open, close) + wickUp),
            low: round2(Math.min(open, close) - wickDown),
            close: round2(close),
        });

        price = close;
        // Keep the walk in a plausible band.
        if (price > 4800) momentum -= volPerBar * 0.1;
        if (price < 3800) momentum += volPerBar * 0.1;
        cursor += barMs;
    }

    return candles;
}

const INTERVAL_MS: Record<string, number> = {
    '1min': 60_000,
    '5min': 5 * 60_000,
    '15min': 15 * 60_000,
    '30min': 30 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1day': 24 * 60 * 60_000,
};

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function mulberry32(a: number): () => number {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
