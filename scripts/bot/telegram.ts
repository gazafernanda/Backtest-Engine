/**
 * Minimal Telegram Bot API client — just the one call this needs.
 */

const API = 'https://api.telegram.org';

export interface TelegramConfig {
    token: string;
    chatId: string;
}

export async function sendMessage(cfg: TelegramConfig, html: string): Promise<void> {
    const res = await fetch(`${API}/bot${cfg.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: cfg.chatId,
            text: html,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
        }),
    });

    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            const body = (await res.json()) as { description?: string };
            if (body.description) detail = body.description;
        } catch {
            /* keep the status code */
        }
        throw new Error(`Telegram rejected the message: ${detail}`);
    }
}

/** Confirms the token is valid and returns the bot's username. */
export async function getMe(token: string): Promise<string> {
    const res = await fetch(`${API}/bot${token}/getMe`);
    const body = (await res.json()) as {
        ok: boolean;
        description?: string;
        result?: { username?: string };
    };
    if (!body.ok) throw new Error(body.description || 'getMe failed');
    return body.result?.username ?? 'unknown';
}

/** Telegram's HTML mode only needs these three escaped. */
export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
