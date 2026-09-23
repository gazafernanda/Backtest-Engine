import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { AppState, AppAction } from '../types';
import { STRATEGIES } from '../engine/strategies';
import { deriveConfig } from '../engine/autoConfig';

function defaultParamsFor(key: string): Record<string, number> {
    const factory = STRATEGIES[key];
    if (!factory) return {};
    const params: Record<string, number> = {};
    factory().paramDefs.forEach((p) => (params[p.key] = p.default));
    return params;
}

/**
 * Everything but capital and risk appetite is derived — see `autoConfig.ts`.
 * The stored config still holds a full snapshot so that turning off auto mode
 * hands the advanced panel something coherent to edit.
 */
const defaultState: AppState = {
    symbol: 'XAU/USD',
    interval: '1min',
    barCount: 5000,
    strategyKey: 'breakOfStructure',
    strategyParams: defaultParamsFor('breakOfStructure'),
    riskProfile: 'balanced',
    autoMode: true,
    config: deriveConfig('balanced', 10000, '1min').config,
    isLoading: false,
    error: null,
    warning: null,
    results: [],
    activeResultIndex: -1,
};

/**
 * Re-derive the config whenever an input to it changes, but only while auto mode
 * is on — once the user opens the advanced panel their values are left alone.
 */
function rederive(state: AppState): AppState {
    if (!state.autoMode) return state;
    return {
        ...state,
        config: deriveConfig(state.riskProfile, state.config.initialCapital, state.interval).config,
    };
}

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_SYMBOL':
            return { ...state, symbol: action.symbol };
        case 'SET_INTERVAL':
            return rederive({ ...state, interval: action.interval });
        case 'SET_RISK_PROFILE':
            return rederive({ ...state, riskProfile: action.riskProfile });
        case 'SET_AUTO_MODE':
            return rederive({ ...state, autoMode: action.autoMode });
        case 'SET_BAR_COUNT':
            return { ...state, barCount: action.barCount };
        case 'SET_STRATEGY':
            return { ...state, strategyKey: action.strategyKey, strategyParams: action.params };
        case 'SET_STRATEGY_PARAMS':
            return { ...state, strategyParams: { ...state.strategyParams, ...action.params } };
        case 'SET_CONFIG':
            // In auto mode only capital is user-owned; changing it re-derives
            // the rest so sizing stays consistent with the new account size.
            return rederive({ ...state, config: { ...state.config, ...action.config } });
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
