// ─── OHLC Candle ─────────────────────────────────────────────
export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

// ─── Trade ───────────────────────────────────────────────────
export interface Trade {
    id: number;
    entryTimestamp: number;
    exitTimestamp: number;
    entryPrice: number;
    exitPrice: number;
    side: 'long' | 'short';
    pnlPercent: number;
    pnlAbsolute: number;
    commission: number;
    holdingPeriodMs: number;
}

// ─── Strategy Signal ─────────────────────────────────────────
export interface Signal {
    type: 'entry' | 'exit';
    side: 'long' | 'short';
    reason: string;
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
    init(candles: Candle[], params: Record<string, number>): void;
    evaluate(index: number): Signal | null;
}

// ─── Backtest Config ─────────────────────────────────────────
export interface BacktestConfig {
    initialCapital: number;
    commissionPercent: number;
    slippagePercent: number;
    stopLossPercent?: number;
    takeProfitPercent?: number;
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
    expectancy: number;
    totalReturn: number;
    totalReturnPercent: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    avgHoldingPeriodMs: number;
    grossProfit: number;
    grossLoss: number;
}

// ─── Backtest Result ─────────────────────────────────────────
export interface BacktestResult {
    strategyName: string;
    coinId: string;
    days: number;
    config: BacktestConfig;
    trades: Trade[];
    equityCurve: EquityPoint[];
    metrics: PerformanceMetrics;
    monthlyBreakdown: MonthlyResult[];
    candles: Candle[];
    indicatorData: Record<string, number[]>;
}

// ─── App State ───────────────────────────────────────────────
export interface AppState {
    coinId: string;
    days: number;
    strategyKey: string;
    strategyParams: Record<string, number>;
    config: BacktestConfig;
    isLoading: boolean;
    error: string | null;
    results: BacktestResult[];
    activeResultIndex: number;
}

export type AppAction =
    | { type: 'SET_COIN'; coinId: string }
    | { type: 'SET_DAYS'; days: number }
    | { type: 'SET_STRATEGY'; strategyKey: string; params: Record<string, number> }
    | { type: 'SET_STRATEGY_PARAMS'; params: Record<string, number> }
    | { type: 'SET_CONFIG'; config: Partial<BacktestConfig> }
    | { type: 'SET_LOADING'; isLoading: boolean }
    | { type: 'SET_ERROR'; error: string | null }
    | { type: 'ADD_RESULT'; result: BacktestResult }
    | { type: 'CLEAR_RESULTS' }
    | { type: 'SET_ACTIVE_RESULT'; index: number };

// ─── Coin Info ───────────────────────────────────────────────
export interface CoinOption {
    id: string;
    symbol: string;
    name: string;
}

export const SUPPORTED_COINS: CoinOption[] = [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
    { id: 'solana', symbol: 'SOL', name: 'Solana' },
    { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
    { id: 'ripple', symbol: 'XRP', name: 'XRP' },
    { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
    { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
    { id: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
    { id: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
    { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
];
