import type { InstrumentSpec } from '../engine/instrument';
import type { RiskProfile } from '../engine/autoConfig';

// ─── OHLC Candle ─────────────────────────────────────────────
export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

// ─── Timeframes ──────────────────────────────────────────────
export interface TimeframeOption {
    value: string;
    label: string;
    ms: number;
}

/** Twelve Data interval strings, with their bar duration. */
export const TIMEFRAMES: TimeframeOption[] = [
    { value: '1min', label: 'M1', ms: 60_000 },
    { value: '5min', label: 'M5', ms: 5 * 60_000 },
    { value: '15min', label: 'M15', ms: 15 * 60_000 },
    { value: '30min', label: 'M30', ms: 30 * 60_000 },
    { value: '1h', label: 'H1', ms: 60 * 60_000 },
    { value: '4h', label: 'H4', ms: 4 * 60 * 60_000 },
    { value: '1day', label: 'D1', ms: 24 * 60 * 60_000 },
];

export function timeframeMs(interval: string): number {
    return TIMEFRAMES.find((t) => t.value === interval)?.ms ?? 60_000;
}

// ─── Trade ───────────────────────────────────────────────────
export interface Trade {
    id: number;
    entryTimestamp: number;
    exitTimestamp: number;
    /** Fill prices, inclusive of spread and slippage. */
    entryPrice: number;
    exitPrice: number;
    side: 'long' | 'short';
    lots: number;
    /** Signed price move in pips, before costs. */
    pips: number;
    grossPnl: number;
    commission: number;
    swap: number;
    /** Net cash result: grossPnl − commission − swap. */
    pnlAbsolute: number;
    /** Net result as a percent of account equity at the moment of entry. */
    pnlPercent: number;
    /** Stop distance at entry, in pips. 0 when no stop was set. */
    riskPips: number;
    /** Net result expressed in units of initial risk. 0 when no stop was set. */
    rMultiple: number;
    /** Maximum adverse / favourable excursion while the trade was open, in pips. */
    maePips: number;
    mfePips: number;
    exitReason: string;
    entryReason: string;
    holdingPeriodMs: number;
}

// ─── Strategy Signal ─────────────────────────────────────────
export interface Signal {
    type: 'entry' | 'exit';
    side: 'long' | 'short';
    reason: string;
    /**
     * Optional structural stop supplied by the strategy (an absolute price,
     * e.g. beyond the swing that invalidates the setup). When present it
     * overrides the fixed stop-loss distance from the config.
     */
    stopPrice?: number;
    /** Optional structural target, as an absolute price. */
    targetPrice?: number;
}

// ─── Strategy Interface ──────────────────────────────────────
export interface StrategyParam {
    key: string;
    label: string;
    default: number;
    min: number;
    max: number;
    step: number;
}

export interface Strategy {
    name: string;
    description: string;
    paramDefs: StrategyParam[];
    init(candles: Candle[], params: Record<string, number>, spec: InstrumentSpec): void;
    evaluate(index: number): Signal | null;
    getIndicatorData(): Record<string, number[]>;
}

// ─── Backtest Config ─────────────────────────────────────────
export type SizingMode = 'fixedLot' | 'riskPercent';
export type SessionFilter = 'all' | 'london' | 'newYork' | 'londonNewYork' | 'asia';

export interface BacktestConfig {
    initialCapital: number;

    // Position sizing
    sizingMode: SizingMode;
    /** Used when sizingMode = 'fixedLot'. */
    fixedLot: number;
    /** Percent of equity risked per trade. Used when sizingMode = 'riskPercent'. */
    riskPercent: number;

    // Dealing costs
    /** Broker spread, in pips. Charged once per round trip. */
    spreadPips: number;
    /** Commission in quote currency per 1.00 lot per side. */
    commissionPerLot: number;
    /** Extra adverse fill, in pips, applied to every fill. */
    slippagePips: number;

    // Risk
    /** Fixed stop distance in pips. 0 = rely on the strategy's structural stop. */
    stopLossPips: number;
    /** Fixed target distance in pips. 0 = off. */
    takeProfitPips: number;
    /** Move the stop to break-even once this many pips of profit are reached. 0 = off. */
    breakEvenPips: number;

    // Leverage & margin
    leverage: number;
    /** Equity/margin ratio (percent) at which open positions are force-closed. */
    stopOutLevel: number;

    // Overnight financing, in quote currency per 1.00 lot per night
    swapLongPerLot: number;
    swapShortPerLot: number;

    // Session filter (entries only; open trades are still managed outside it)
    sessionFilter: SessionFilter;
}

// ─── Equity Point ────────────────────────────────────────────
export interface EquityPoint {
    timestamp: number;
    equity: number;
    drawdown: number;
}

// ─── Monthly Result ──────────────────────────────────────────
export interface MonthlyResult {
    year: number;
    month: number;
    label: string;
    pnl: number;
    pnlPercent: number;
    pips: number;
    trades: number;
    winRate: number;
}

// ─── Performance Metrics ─────────────────────────────────────
export interface PerformanceMetrics {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    /** Expectancy per trade, in quote currency. */
    expectancy: number;
    /** Expectancy per trade, in R. 0 when no trade carried a stop. */
    expectancyR: number;
    totalReturn: number;
    totalReturnPercent: number;
    totalPips: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    avgRMultiple: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    avgHoldingPeriodMs: number;
    grossProfit: number;
    grossLoss: number;
    totalCommission: number;
    totalSwap: number;
    /** Trades closed by the broker because margin ran out. */
    stopOutCount: number;
}

// ─── Backtest Result ─────────────────────────────────────────
export interface BacktestResult {
    strategyName: string;
    symbol: string;
    interval: string;
    barCount: number;
    config: BacktestConfig;
    trades: Trade[];
    equityCurve: EquityPoint[];
    metrics: PerformanceMetrics;
    monthlyBreakdown: MonthlyResult[];
    candles: Candle[];
    indicatorData: Record<string, number[]>;
    /** True when the run used generated data because the API was unreachable. */
    isSyntheticData: boolean;
}

// ─── App State ───────────────────────────────────────────────
export interface AppState {
    symbol: string;
    interval: string;
    barCount: number;
    strategyKey: string;
    strategyParams: Record<string, number>;
    /** How much of the account to risk. Drives the derived config in auto mode. */
    riskProfile: RiskProfile;
    /** When true, everything but capital and risk profile is derived. */
    autoMode: boolean;
    config: BacktestConfig;
    isLoading: boolean;
    error: string | null;
    warning: string | null;
    results: BacktestResult[];
    activeResultIndex: number;
}

export type AppAction =
    | { type: 'SET_SYMBOL'; symbol: string }
    | { type: 'SET_INTERVAL'; interval: string }
    | { type: 'SET_BAR_COUNT'; barCount: number }
    | { type: 'SET_STRATEGY'; strategyKey: string; params: Record<string, number> }
    | { type: 'SET_STRATEGY_PARAMS'; params: Record<string, number> }
    | { type: 'SET_CONFIG'; config: Partial<BacktestConfig> }
    | { type: 'SET_RISK_PROFILE'; riskProfile: RiskProfile }
    | { type: 'SET_AUTO_MODE'; autoMode: boolean }
    | { type: 'SET_LOADING'; isLoading: boolean }
    | { type: 'SET_ERROR'; error: string | null }
    | { type: 'SET_WARNING'; warning: string | null }
    | { type: 'ADD_RESULT'; result: BacktestResult }
    | { type: 'CLEAR_RESULTS' }
    | { type: 'SET_ACTIVE_RESULT'; index: number };

// ─── Tradable symbols ────────────────────────────────────────
export interface SymbolOption {
    value: string;
    label: string;
}

export const SUPPORTED_SYMBOLS: SymbolOption[] = [
    { value: 'XAU/USD', label: 'XAU/USD — Gold Spot' },
    { value: 'XAG/USD', label: 'XAG/USD — Silver Spot' },
];

export const BAR_COUNT_OPTIONS = [500, 1000, 2000, 5000];
