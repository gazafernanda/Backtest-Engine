/**
 * Daily API budget tracker.
 *
 * The free Twelve Data tier allows 800 requests a day, reset at UTC midnight.
 * Nothing stops you spending them in an hour, so this counts what has been used
 * and lets the caller slow down or stop before the feed starts failing.
 *
 * The count lives in localStorage, which means it is per-browser and can be
 * cleared. It is a guard rail, not an accounting system — the alert bot spends
 * from the same quota and is not counted here.
 */

const STORAGE_KEY = 'xau_quota';

/** Free tier ceiling. */
export const DAILY_LIMIT = 800;
/** Back off to a slow cadence past this. */
export const SOFT_LIMIT = 700;
/** Stop polling entirely past this, leaving headroom for the bot. */
export const HARD_LIMIT = 780;

interface QuotaRecord {
    /** UTC date, YYYY-MM-DD. */
    day: string;
    used: number;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function read(): QuotaRecord {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<QuotaRecord>;
            if (parsed.day === today() && typeof parsed.used === 'number') {
                return { day: parsed.day, used: parsed.used };
            }
        }
    } catch {
        // Blocked or unparseable storage — treat as a fresh day.
    }
    return { day: today(), used: 0 };
}

function write(record: QuotaRecord): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
        // Nothing to do; the guard simply stops working in this browser.
    }
}

export function usedToday(): number {
    return read().used;
}

export function recordRequest(): number {
    const record = read();
    record.used += 1;
    write(record);
    return record.used;
}

export type QuotaState = 'ok' | 'slow' | 'exhausted';

export function quotaState(): QuotaState {
    const used = usedToday();
    if (used >= HARD_LIMIT) return 'exhausted';
    if (used >= SOFT_LIMIT) return 'slow';
    return 'ok';
}

/** Milliseconds until the quota resets (UTC midnight). */
export function msUntilReset(): number {
    const now = new Date();
    const reset = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0,
    );
    return reset - now.getTime();
}
