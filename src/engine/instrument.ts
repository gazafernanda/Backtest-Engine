/**
 * Instrument specification — gold (XAU/USD) contract maths.
 *
 * Everything money-related in the engine flows through here. Gold is quoted in
 * USD, so no currency conversion is needed: a price move translates to P&L with
 * a single multiplication by contract size.
 */

export interface InstrumentSpec {
    symbol: string;
    displayName: string;
    /** Units of the base asset per 1.00 lot. Gold: 100 troy ounces. */
    contractSize: number;
    /** Price distance of one pip. Gold: 0.10 (a $1 move = 10 pips). */
    pipSize: number;
    /** Smallest price increment quoted by the broker. */
    pointSize: number;
    priceDecimals: number;
    minLot: number;
    lotStep: number;
    maxLot: number;
    quoteCurrency: string;
}

export const XAUUSD: InstrumentSpec = {
    symbol: 'XAU/USD',
    displayName: 'Gold Spot / US Dollar',
    contractSize: 100,
    pipSize: 0.1,
    pointSize: 0.01,
    priceDecimals: 2,
    minLot: 0.01,
    lotStep: 0.01,
    maxLot: 100,
    quoteCurrency: 'USD',
};

export const XAGUSD: InstrumentSpec = {
    symbol: 'XAG/USD',
    displayName: 'Silver Spot / US Dollar',
    contractSize: 5000,
    pipSize: 0.01,
    pointSize: 0.001,
    priceDecimals: 3,
    minLot: 0.01,
    lotStep: 0.01,
    maxLot: 100,
    quoteCurrency: 'USD',
};

export const INSTRUMENTS: Record<string, InstrumentSpec> = {
    'XAU/USD': XAUUSD,
    'XAG/USD': XAGUSD,
};

export const DEFAULT_INSTRUMENT = XAUUSD;

// ─── Conversions ─────────────────────────────────────────────

/** Price distance → pips. `pips(XAUUSD, 1.50)` = 15. */
export function toPips(spec: InstrumentSpec, priceDistance: number): number {
    return priceDistance / spec.pipSize;
}

/** Pips → price distance. `toPrice(XAUUSD, 15)` = 1.50. */
export function pipsToPrice(spec: InstrumentSpec, pips: number): number {
    return pips * spec.pipSize;
}

/**
 * Cash value of one pip for a given lot size.
 * Gold at 1.00 lot: 100 oz × 0.10 = $10 per pip.
 */
export function pipValue(spec: InstrumentSpec, lots: number): number {
    return spec.contractSize * spec.pipSize * lots;
}

/** Signed P&L in quote currency for a price move, before costs. */
export function priceMoveToMoney(
    spec: InstrumentSpec,
    side: 'long' | 'short',
    entryPrice: number,
    exitPrice: number,
    lots: number,
): number {
    const diff = side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
    return diff * spec.contractSize * lots;
}

/** Margin locked by a position, in quote currency. */
export function requiredMargin(
    spec: InstrumentSpec,
    price: number,
    lots: number,
    leverage: number,
): number {
    if (leverage <= 0) return 0;
    return (price * spec.contractSize * lots) / leverage;
}

/** Snap a lot size to the broker's step and bounds. */
export function normalizeLots(spec: InstrumentSpec, lots: number): number {
    if (!isFinite(lots) || lots <= 0) return 0;
    const stepped = Math.floor(lots / spec.lotStep) * spec.lotStep;
    const bounded = Math.min(spec.maxLot, Math.max(0, stepped));
    // Guard against binary-float dust (0.30000000000000004 → 0.3).
    const rounded = Number(bounded.toFixed(4));
    return rounded < spec.minLot ? 0 : rounded;
}

/**
 * Lot size such that `stopPips` of adverse movement costs `riskAmount`.
 * Returns 0 when the resulting size is below the broker minimum — the caller
 * must treat that as "skip this trade", not as "trade the minimum".
 */
export function lotsForRisk(
    spec: InstrumentSpec,
    riskAmount: number,
    stopPips: number,
): number {
    if (stopPips <= 0 || riskAmount <= 0) return 0;
    const perPip = pipValue(spec, 1);
    return normalizeLots(spec, riskAmount / (stopPips * perPip));
}
