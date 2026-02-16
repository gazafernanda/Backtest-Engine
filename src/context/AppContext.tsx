import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { AppState, AppAction } from '../types';

const defaultState: AppState = {
    coinId: 'bitcoin',
    days: 90,
    strategyKey: 'emaCrossover',
    strategyParams: { fastPeriod: 50, slowPeriod: 200 },
    config: {
        initialCapital: 10000,
        commissionPercent: 0.1,
        slippagePercent: 0.05,
        stopLossPercent: 0,
        takeProfitPercent: 0,
    },
    isLoading: false,
    error: null,
    results: [],
    activeResultIndex: -1,
};

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_COIN':
            return { ...state, coinId: action.coinId };
        case 'SET_DAYS':
            return { ...state, days: action.days };
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
