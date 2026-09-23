import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { AppState, AppAction } from '../types';
import { STRATEGIES } from '../engine/strategies';

function defaultParamsFor(key: string): Record<string, number> {
    const factory = STRATEGIES[key];
    if (!factory) return {};
    const params: Record<string, number> = {};
    factory().paramDefs.forEach((p) => (params[p.key] = p.default));
    return params;
}

/**
 * Defaults model a typical retail spot-gold account: 1:100 leverage, a 2-pip
 * (20 cent) spread, 1% of equity risked per trade, and entries restricted to
 * the London/New York overlap where gold actually moves.
 */
const defaultState: AppState = {
    symbol: 'XAU/USD',
    interval: '1min',
    barCount: 5000,
    strategyKey: 'breakOfStructure',
    strategyParams: defaultParamsFor('breakOfStructure'),
    config: {
        initialCapital: 10000,

        sizingMode: 'riskPercent',
        fixedLot: 0.1,
        riskPercent: 1,

        spreadPips: 2,
        commissionPerLot: 0,
        slippagePips: 0.5,

        stopLossPips: 0,
        takeProfitPips: 0,
        breakEvenPips: 0,

        leverage: 100,
        stopOutLevel: 50,

        swapLongPerLot: -5,
        swapShortPerLot: 2,

        sessionFilter: 'londonNewYork',
    },
    isLoading: false,
    error: null,
    warning: null,
    results: [],
    activeResultIndex: -1,
};

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_SYMBOL':
            return { ...state, symbol: action.symbol };
        case 'SET_INTERVAL':
            return { ...state, interval: action.interval };
        case 'SET_BAR_COUNT':
            return { ...state, barCount: action.barCount };
        case 'SET_STRATEGY':
            return { ...state, strategyKey: action.strategyKey, strategyParams: action.params };
        case 'SET_STRATEGY_PARAMS':
            return { ...state, strategyParams: { ...state.strategyParams, ...action.params } };
        case 'SET_CONFIG':
            return { ...state, config: { ...state.config, ...action.config } };
        case 'SET_LOADING':
            return { ...state, isLoading: action.isLoading };
        case 'SET_ERROR':
            return { ...state, error: action.error };
        case 'SET_WARNING':
            return { ...state, warning: action.warning };
        case 'ADD_RESULT':
            return {
                ...state,
                results: [...state.results, action.result],
                activeResultIndex: state.results.length,
            };
        case 'CLEAR_RESULTS':
            return { ...state, results: [], activeResultIndex: -1 };
        case 'SET_ACTIVE_RESULT':
            return { ...state, activeResultIndex: action.index };
        default:
            return state;
    }
}

const AppContext = createContext<{
    state: AppState;
    dispatch: Dispatch<AppAction>;
}>({
    state: defaultState,
    dispatch: () => { },
});

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(appReducer, defaultState);

    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    );
}

export function useAppState() {
    return useContext(AppContext);
}
