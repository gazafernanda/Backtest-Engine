import type { Candle } from '../types';

/**
 * Twelve Data fetch, with no browser or bundler dependencies.
 *
 * Deliberately free of `localStorage` and `import.meta` so the same code runs
 * in the browser app and in the Node alert bot. Anything environment-specific
 * (caching, key resolution, fallbacks) belongs in the callers.
 */

export const TWELVEDATA_BASE = 'https://api.twelvedata.com';

export interface TimeSeriesRequest {
    symbol: string;
    interval: string;
    outputsize: number;
    apiKey: string;
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

export async function fetchTimeSeries(req: TimeSeriesRequest): Promise<Candle[]> {
    const url =
        `${TWELVEDATA_BASE}/time_series` +
        `?symbol=${encodeURIComponent(req.symbol)}` +
        `&interval=${encodeURIComponent(req.interval)}` +
        `&outputsize=${req.outputsize}` +
        `&order=ASC` +
        `&timezone=UTC` +
        `&format=JSON` +
        `&apikey=${encodeURIComponent(req.apiKey)}`;

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
        throw new Error(`No bars returned for ${req.symbol} @ ${req.interval}`);
    }

    const candles = data.values
        .map(parseBar)
        .filter((c): c is Candle => c !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (candles.length === 0) throw new Error('All returned bars failed to parse');
    return candles;
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
 * runtime apply a local offset here would shift every session filter.
 */
function parseDatetime(value: string): number {
    if (!value) return NaN;
    const iso = value.includes(' ') ? value.replace(' ', 'T') : `${value}T00:00:00`;
    return Date.parse(`${iso}Z`);
}
