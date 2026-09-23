/**
 * Formatting helpers for the dashboard.
 */

export function formatCurrency(value: number): string {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
    return `${sign}$${abs.toFixed(2)}`;
}

/** Signed currency, for P&L columns where the direction matters at a glance. */
export function formatSignedCurrency(value: number): string {
    return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`;
}

export function formatPercent(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatPips(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)} pips`;
}

export function formatLots(value: number): string {
    return value.toFixed(2);
}

export function formatPrice(value: number, decimals = 2): string {
    return value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

export function formatR(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

export function formatNumber(value: number, decimals: number = 2): string {
    return value.toFixed(decimals);
}

/**
 * Timestamps are UTC throughout the engine — sessions, swap rollovers and the
 * Twelve Data feed all agree on that — so they are rendered in UTC too.
 */
export function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

export function formatDateTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
    });
}

export function formatDuration(ms: number): string {
    const minutes = ms / 60_000;
    if (minutes < 60) return `${minutes.toFixed(0)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    if (days < 30) return `${days.toFixed(1)}d`;
    return `${(days / 30).toFixed(1)}mo`;
}

export function classNames(...classes: (string | false | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ');
}
