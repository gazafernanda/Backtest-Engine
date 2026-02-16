/**
 * Utility functions for formatting values in the dashboard.
 */

export function formatCurrency(value: number): string {
    if (Math.abs(value) >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1_000) {
        return `$${(value / 1_000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
}

export function formatPercent(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatNumber(value: number, decimals: number = 2): string {
    return value.toFixed(decimals);
}

export function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function formatDateTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatDuration(ms: number): string {
    const hours = ms / (1000 * 60 * 60);
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    if (days < 30) return `${days.toFixed(1)}d`;
    const months = days / 30;
    return `${months.toFixed(1)}mo`;
}

export function classNames(...classes: (string | false | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ');
}
