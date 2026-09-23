/**
 * XAU/USD signal alert bot — `npm run bot`.
 *
 * Polls Twelve Data, runs the same price action strategies the browser app
 * uses, and pushes new setups to Telegram. Also follows each alerted setup and
 * reports whether it reached its target or its stop.
 *
 * This runs locally on purpose. A bot token in a browser bundle is readable by
 * anyone who loads the page, and whoever reads it can post to your chat.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { fetchTimeSeries } from '../../src/data/twelvedataCore';
import { INSTRUMENTS, DEFAULT_INSTRUMENT } from '../../src/engine/instrument';
import { scanSignals, resolveOutcome, type LiveSignal } from '../../src/engine/liveSignal';
import { lotsForRisk, pipValue } from '../../src/engine/instrument';
import { sendMessage, getMe, escapeHtml, type TelegramConfig } from './telegram';

// ── Configuration ────────────────────────────────────────────

const SYMBOL = process.env.BOT_SYMBOL ?? 'XAU/USD';
const INTERVAL = process.env.BOT_INTERVAL ?? '1min';
const BARS = Number(process.env.BOT_BARS ?? 500);
/** Default 2 minutes: 720 requests/day against the free tier's 800. */
const POLL_MS = Number(process.env.BOT_POLL_SECONDS ?? 120) * 1000;
/** Ignore setups older than this so a restart does not alert stale signals. */
const MAX_SIGNAL_AGE_MS = Number(process.env.BOT_MAX_SIGNAL_AGE_MINUTES ?? 15) * 60_000;

const ACCOUNT_SIZE = Number(process.env.BOT_ACCOUNT_SIZE ?? 0);
const RISK_PERCENT = Number(process.env.BOT_RISK_PERCENT ?? 1);

const STATE_PATH = resolve(process.cwd(), '.bot-state.json');

// ── Persisted state ──────────────────────────────────────────

interface BotState {
    /** Signal ids already announced, newest last. */
    notified: string[];
    /** Alerted setups still waiting on an outcome. */
    open: Record<string, LiveSignal>;
    initialised: boolean;
}

function loadState(): BotState {
    if (!existsSync(STATE_PATH)) {
        return { notified: [], open: {}, initialised: false };
    }
    try {
        // Strip a UTF-8 BOM: Windows editors and PowerShell add one, and
        // JSON.parse rejects it, which would silently reset the bot's memory
        // and re-announce every signal it had already sent.
        const raw = readFileSync(STATE_PATH, 'utf8').replace(/^﻿/, '');
        const parsed = JSON.parse(raw) as Partial<BotState>;
        return {
            notified: Array.isArray(parsed.notified) ? parsed.notified : [],
            open: parsed.open ?? {},
            initialised: parsed.initialised === true,
        };
    } catch {
        console.warn('State file unreadable; starting fresh.');
        return { notified: [], open: {}, initialised: false };
    }
}

function saveState(state: BotState): void {
    // Keep the notified list from growing without bound.
    if (state.notified.length > 500) {
        state.notified = state.notified.slice(-500);
    }
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Message formatting ───────────────────────────────────────

const spec = INSTRUMENTS[SYMBOL] ?? DEFAULT_INSTRUMENT;
const dp = spec.priceDecimals;

function fmt(n: number): string {
    return n.toFixed(dp);
}

function utc(ts: number): string {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function signalMessage(s: LiveSignal): string {
    const arrow = s.side === 'long' ? '🟢' : '🔴';
    const lines = [
        `${arrow} <b>${s.side.toUpperCase()} ${escapeHtml(SYMBOL)}</b> · ${INTERVAL}`,
        `<i>${escapeHtml(s.strategy)}</i>`,
        '',
        `<b>Entry</b>  <code>${fmt(s.entry)}</code>`,
        `<b>SL</b>     <code>${fmt(s.stop)}</code>  (${s.riskPips.toFixed(1)} pips)`,
        `<b>TP</b>     <code>${fmt(s.target)}</code>  (${s.rewardPips.toFixed(1)} pips)`,
        `<b>R:R</b>    1 : ${s.riskReward.toFixed(2)}`,
    ];

    // Only suggest a size when an account size was configured.
    if (ACCOUNT_SIZE > 0 && RISK_PERCENT > 0) {
        const riskMoney = ACCOUNT_SIZE * (RISK_PERCENT / 100);
        const lots = lotsForRisk(spec, riskMoney, s.riskPips);
        if (lots > 0) {
            const actualRisk = lots * s.riskPips * pipValue(spec, 1);
            lines.push(
                `<b>Size</b>   ${lots.toFixed(2)} lot  (risks $${actualRisk.toFixed(2)} of $${ACCOUNT_SIZE})`,
            );
        } else {
            lines.push(`<b>Size</b>   below minimum lot at ${RISK_PERCENT}% risk — skip`);
        }
    }

    lines.push('', escapeHtml(s.reason), utc(s.timestamp));
    return lines.join('\n');
}

function outcomeMessage(s: LiveSignal, outcome: string, barsHeld: number): string {
    const hit = outcome === 'target hit';
    const icon = hit ? '✅' : '❌';
    const pips = hit ? s.rewardPips : -s.riskPips;
    const r = hit ? s.riskReward : -1;

    return [
        `${icon} <b>${outcome.toUpperCase()}</b> — ${s.side.toUpperCase()} ${escapeHtml(SYMBOL)}`,
        `<i>${escapeHtml(s.strategy)}</i>`,
        '',
        `${pips >= 0 ? '+' : ''}${pips.toFixed(1)} pips  ·  ${r >= 0 ? '+' : ''}${r.toFixed(2)}R`,
        `Entry <code>${fmt(s.entry)}</code> → ${hit ? 'TP' : 'SL'} <code>${fmt(hit ? s.target : s.stop)}</code>`,
        `Held ${barsHeld} bar${barsHeld === 1 ? '' : 's'}`,
    ].join('\n');
}

// ── Main loop ────────────────────────────────────────────────

type Send = (html: string) => Promise<void>;

async function tick(send: Send, apiKey: string, state: BotState): Promise<void> {
    const candles = await fetchTimeSeries({
        symbol: SYMBOL,
        interval: INTERVAL,
        outputsize: BARS,
    apiKey,
    });

    const signals = scanSignals(candles, spec, 50);
    const now = candles[candles.length - 1].timestamp;

    // First run: record what already exists without announcing it, so starting
    // the bot does not fire off a burst of historical setups.
    if (!state.initialised) {
        state.notified = signals.map((s) => s.id);
        state.initialised = true;
        saveState(state);
        console.log(`Primed with ${signals.length} existing signals; watching for new ones.`);
        return;
    }

    // ── New setups ───────────────────────────────────────────
    const seen = new Set(state.notified);
    const fresh = signals
        .filter((s) => !seen.has(s.id))
        .filter((s) => now - s.timestamp <= MAX_SIGNAL_AGE_MS)
        .sort((a, b) => a.timestamp - b.timestamp);

    for (const s of fresh) {
        await send(signalMessage(s));
        state.notified.push(s.id);
        state.open[s.id] = s;
        console.log(`Alerted ${s.side} ${s.strategy} @ ${fmt(s.entry)} (${utc(s.timestamp)})`);
    }

    // ── Resolutions ──────────────────────────────────────────
    for (const [id, s] of Object.entries(state.open)) {
        // The stored signal's barIndex is from an earlier poll; re-anchor it to
        // this candle set by timestamp before resolving.
        const idx = candles.findIndex((c) => c.timestamp === s.timestamp);
        if (idx === -1) {
            // Scrolled out of the window — nothing more we can say about it.
            delete state.open[id];
            continue;
        }

        const { outcome, barsHeld } = resolveOutcome({ ...s, barIndex: idx }, candles);
        if (outcome !== 'open') {
            await send(outcomeMessage(s, outcome, barsHeld));
            delete state.open[id];
            console.log(`Resolved ${id}: ${outcome}`);
        }
    }

    saveState(state);
}

/** Strips Telegram's HTML so dry-run output is readable in a terminal. */
function toPlainText(html: string): string {
    return html
        .replace(/<\/?(b|i|code|pre)>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

async function main(): Promise<void> {
    const apiKey = (process.env.VITE_TWELVEDATA_API_KEY ?? '').trim();
    const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
    const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();
    // Prints messages instead of sending them, so the pipeline can be checked
    // against live prices before a bot exists.
    const dryRun = process.env.BOT_DRY_RUN === '1';

    const missing: string[] = [];
    if (!apiKey) missing.push('VITE_TWELVEDATA_API_KEY');
    if (!dryRun && !token) missing.push('TELEGRAM_BOT_TOKEN');
    if (!dryRun && !chatId) missing.push('TELEGRAM_CHAT_ID');

    if (missing.length > 0) {
        console.error(`Missing in .env: ${missing.join(', ')}`);
        console.error('See .env.example for how to obtain each one.');
        console.error('Or set BOT_DRY_RUN=1 to print alerts instead of sending them.');
        process.exit(1);
    }

    let send: Send;

    if (dryRun) {
        send = async (html) => {
            console.log('\n' + '─'.repeat(46));
            console.log(toPlainText(html));
            console.log('─'.repeat(46));
        };
        console.log('DRY RUN — alerts are printed, not sent.');
    } else {
        const cfg: TelegramConfig = { token, chatId };
        try {
            const username = await getMe(token);
            console.log(`Connected as @${username}`);
        } catch (e) {
            console.error(`Telegram token rejected: ${e instanceof Error ? e.message : e}`);
            process.exit(1);
        }
        send = (html) => sendMessage(cfg, html);
    }

    console.log(`Watching ${SYMBOL} ${INTERVAL}, polling every ${POLL_MS / 1000}s`);

    const state = loadState();

    // A single guard so a slow request cannot overlap the next tick.
    let running = false;
    const run = async () => {
        if (running) return;
        running = true;
        try {
            await tick(send, apiKey, state);
        } catch (e) {
            // Keep polling: a transient API or network error should not stop the bot.
            console.error(`Tick failed: ${e instanceof Error ? e.message : e}`);
        } finally {
            running = false;
        }
    };

    await run();
    setInterval(run, POLL_MS);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
