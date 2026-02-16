import type { Candle } from '../types';

const API_BASE = 'https://api.coingecko.com/api/v3';

/**
 * Fetch OHLC data from CoinGecko.
 *
 * The `days` parameter determines granularity:
 * - 1-2 days:   30-minute candles
 * - 3-30 days:  4-hour candles
 * - 31+ days:   4-day candles
 *
 * For market_chart/range we get better granularity:
 * - within 1 day:  5-minute
 * - 1-90 days:     hourly
 * - 90+ days:      daily
 *
 * We use /coins/{id}/ohlc for proper OHLC candles.
 */
export async function fetchOHLC(coinId: string, days: number): Promise<Candle[]> {
    // Check cache first
    const cached = getFromCache(coinId, days);
    if (cached) return cached;

    try {
        // Use the OHLC endpoint for proper candle data
        const url = `${API_BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
        }

        const data: number[][] = await response.json();

        // CoinGecko OHLC format: [timestamp, open, high, low, close]
        const candles: Candle[] = data.map((item) => ({
            timestamp: item[0],
            open: item[1],
            high: item[2],
            low: item[3],
            close: item[4],
        }));

        // Cache the result
        saveToCache(coinId, days, candles);

        return candles;
    } catch (error) {
        console.error('Failed to fetch from CoinGecko:', error);

        // Return fallback sample data for offline development
        return generateSampleData(days);
    }
}

// ─── Cache Layer ─────────────────────────────────────────────

const CACHE_PREFIX = 'bt_ohlc_';

interface CacheEntry {
    timestamp: number;
    data: Candle[];
}

function getCacheKey(coinId: string, days: number): string {
    return `${CACHE_PREFIX}${coinId}_${days}`;
}

function getFromCache(coinId: string, days: number): Candle[] | null {
    try {
        const key = getCacheKey(coinId, days);
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const entry: CacheEntry = JSON.parse(raw);
        const ttlMs = days <= 30 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 1h or 24h

        if (Date.now() - entry.timestamp > ttlMs) {
            localStorage.removeItem(key);
            return null;
        }

        return entry.data;
    } catch {
        return null;
    }
}

function saveToCache(coinId: string, days: number, data: Candle[]): void {
    try {
        const key = getCacheKey(coinId, days);
        const entry: CacheEntry = { timestamp: Date.now(), data };
        localStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // localStorage might be full, silently fail
        console.warn('Failed to cache OHLC data');
    }
}

// ─── Fallback Sample Data ────────────────────────────────────

/**
 * Generate realistic-looking sample BTC price data for offline dev/demo.
 * Uses a random walk with momentum and mean reversion.
 */
function generateSampleData(days: number): Candle[] {
    const candles: Candle[] = [];
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    // Determine interval based on days
    let intervalMs: number;
    let numCandles: number;
    if (days <= 7) {
        intervalMs = 30 * 60 * 1000; // 30-min candles
        numCandles = Math.floor((days * msPerDay) / intervalMs);
    } else if (days <= 90) {
        intervalMs = 4 * 60 * 60 * 1000; // 4-hour candles
        numCandles = Math.floor((days * msPerDay) / intervalMs);
    } else {
        intervalMs = msPerDay; // daily candles
        numCandles = days;
    }

    let price = 42000 + Math.random() * 20000; // Start between $42k-$62k
    let momentum = 0;

    // Seed random with a fixed value for reproducibility
    const rng = mulberry32(12345);

    for (let i = 0; i < numCandles; i++) {
        const timestamp = now - (numCandles - i) * intervalMs;

        // Add some trending behavior
        momentum = momentum * 0.98 + (rng() - 0.48) * 0.005;
        const volatility = 0.005 + rng() * 0.015;

        const open = price;
        const change = price * (momentum + (rng() - 0.5) * volatility);
        const close = open + change;

        const highExtra = Math.abs(change) * (0.5 + rng());
        const lowExtra = Math.abs(change) * (0.5 + rng());

        const high = Math.max(open, close) + highExtra;
        const low = Math.min(open, close) - lowExtra;

        candles.push({
            timestamp,
            open: roundPrice(open),
            high: roundPrice(high),
            low: roundPrice(Math.max(low, 100)), // Price floor
            close: roundPrice(close),
        });

        price = close;

        // Mean reversion
        if (price > 80000) momentum -= 0.001;
        if (price < 20000) momentum += 0.001;
    }

    return candles;
}

function roundPrice(n: number): number {
    return Math.round(n * 100) / 100;
}

// Simple deterministic PRNG
function mulberry32(a: number): () => number {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
