import type { BacktestConfig, SessionFilter } from '../types';

/**
 * Automatic configuration.
 *
 * Most of a backtest's settings are not really preferences — they are
 * consequences of what you are trading and how much you are willing to lose.
 * This derives the whole config from two plain choices (how much money, how much
 * risk) plus the timeframe, so nobody has to know what a swap rate is to get a
 * sensible run.
 *
 * Every derived value is paired with a short reason, which the UI shows. The
 * point is that the settings stay inspectable: automatic, not hidden.
 */

export type RiskProfile = 'careful' | 'balanced' | 'aggressive';

export interface RiskProfileInfo {
    value: RiskProfile;
    label: string;
    blurb: string;
}

export const RISK_PROFILES: RiskProfileInfo[] = [
    {
        value: 'careful',
        label: 'Careful',
        blurb: 'Risks 0.5% per trade. A 10-loss streak costs about 5% of the account.',
    },
    {
        value: 'balanced',
        label: 'Balanced',
        blurb: 'Risks 1% per trade — the usual starting point. 10 losses in a row costs about 10%.',
    },
    {
        value: 'aggressive',
        label: 'Aggressive',
        blurb: 'Risks 2% per trade. Grows faster, but a 10-loss streak costs about 18%.',
    },
];

const RISK_PERCENT: Record<RiskProfile, number> = {
    careful: 0.5,
    balanced: 1,
    aggressive: 2,
};

const LEVERAGE: Record<RiskProfile, number> = {
    careful: 50,
    balanced: 100,
    aggressive: 200,
};

/**
 * Intraday trading lives or dies on liquidity, so entries are confined to the
 * London/New York window on fast timeframes. On H1 and slower a trade is held
 * long enough that the entry hour matters far less than the missed setups would.
 */
function sessionFor(interval: string): { session: SessionFilter; why: string } {
    switch (interval) {
        case '1min':
        case '5min':
        case '15min':
        case '30min':
            return {
                session: 'londonNewYork',
                why: 'Intraday entries are limited to the London/New York overlap, where gold actually moves. Outside it, spreads widen and the moves are noise.',
            };
        default:
            return {
                session: 'all',
                why: 'On this timeframe trades are held across sessions anyway, so entries are not restricted by hour.',
            };
    }
}

/**
 * Slippage scales with how fast you are trading: an M1 fill is far more likely
 * to move between signal and execution than a daily one.
 */
function slippageFor(interval: string): number {
    switch (interval) {
        case '1min':
            return 0.5;
        case '5min':
        case '15min':
            return 0.4;
        case '30min':
        case '1h':
            return 0.3;
        default:
            return 0.2;
    }
}

export interface DerivedConfig {
    config: BacktestConfig;
    /** Human-readable account of what was chosen and why. */
    rationale: { label: string; value: string; why: string }[];
}

export function deriveConfig(
    profile: RiskProfile,
    initialCapital: number,
    interval: string,
): DerivedConfig {
    const { session, why: sessionWhy } = sessionFor(interval);
    const slippagePips = slippageFor(interval);
    const riskPercent = RISK_PERCENT[profile];
    const leverage = LEVERAGE[profile];

    const config: BacktestConfig = {
        initialCapital,

        sizingMode: 'riskPercent',
        fixedLot: 0.1,
        riskPercent,

        // A 20-cent spread and no commission matches a typical retail
        // spread-only gold account. Calibrate against your own fills.
        spreadPips: 2,
        commissionPerLot: 0,
        slippagePips,

        // 0 means each strategy's own structural stop and target are used —
        // the level that actually invalidates the setup.
        stopLossPips: 0,
        takeProfitPips: 0,
        breakEvenPips: 0,

        leverage,
        stopOutLevel: 50,

        swapLongPerLot: -5,
        swapShortPerLot: 2,

        sessionFilter: session,
    };

    const rationale = [
        {
            label: 'Risk per trade',
            value: `${riskPercent}% of equity`,
            why: `Position size is calculated backwards from the stop, so every trade risks the same ${riskPercent}% no matter how wide the setup is.`,
        },
        {
            label: 'Stop & target',
            value: 'From the setup',
            why: 'Each strategy supplies the level that invalidates it, rather than an arbitrary pip distance.',
        },
        {
            label: 'Entry hours',
            value: session === 'all' ? 'Any' : 'London + New York',
            why: sessionWhy,
        },
        {
            label: 'Trading costs',
            value: `2 pip spread, ${slippagePips} pip slippage`,
            why: 'A round trip pays one full spread. Slippage is scaled to the timeframe — faster trading gets worse fills.',
        },
        {
            label: 'Leverage',
            value: `1:${leverage}`,
            why: 'Only caps how large a position can be opened. It does not change the risk per trade, which the stop already fixes.',
        },
    ];

    return { config, rationale };
}
