import React, { useEffect, useRef } from 'react';
import {
    createChart,
    ColorType,
    LineStyle,
    type IChartApi,
    type ISeriesApi,
    type IPriceLine,
    type UTCTimestamp,
    type CandlestickData,
    type SeriesMarker,
    type Time,
} from 'lightweight-charts';
import type { Candle } from '../types';
import type { LiveSignal } from '../engine/liveSignal';

interface Props {
    candles: Candle[];
    signal: LiveSignal | null;
    priceDecimals: number;
}

const ENTRY_COLOR = '#00d4ff';
const STOP_COLOR = '#ff1744';
const TARGET_COLOR = '#00e676';

/**
 * Candlestick chart with the active setup drawn on it: entry, stop and target
 * as labelled price lines, plus a marker on the signal bar.
 *
 * The chart instance is created once and then fed new data, rather than being
 * torn down on every poll — recreating it would reset the user's pan and zoom
 * every couple of minutes.
 */
export function SignalChart({ candles, signal, priceDecimals }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const hasFittedRef = useRef(false);

    // ── Create once ──────────────────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#8892b0',
                fontFamily: 'Inter, system-ui, sans-serif',
            },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.04)' },
                horzLines: { color: 'rgba(255,255,255,0.04)' },
            },
            rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
            timeScale: {
                borderColor: 'rgba(255,255,255,0.1)',
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: { mode: 1 },
            autoSize: true,
        });

        const series = chart.addCandlestickSeries({
            upColor: '#00e676',
            downColor: '#ff1744',
            borderUpColor: '#00e676',
            borderDownColor: '#ff1744',
            wickUpColor: '#00e676',
            wickDownColor: '#ff1744',
            priceFormat: { type: 'price', precision: priceDecimals, minMove: 1 / 10 ** priceDecimals },
        });

        chartRef.current = chart;
        seriesRef.current = series;

        return () => {
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
            priceLinesRef.current = [];
            hasFittedRef.current = false;
        };
    }, [priceDecimals]);

    // ── Feed candles ─────────────────────────────────────────
    useEffect(() => {
        const series = seriesRef.current;
        if (!series || candles.length === 0) return;

        const data: CandlestickData[] = candles.map((c) => ({
            time: (c.timestamp / 1000) as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        }));

        series.setData(data);

        // Only frame the chart on first load, so later polls leave the view alone.
        if (!hasFittedRef.current && chartRef.current) {
            chartRef.current.timeScale().fitContent();
            hasFittedRef.current = true;
        }
    }, [candles]);

    // ── Draw the setup ───────────────────────────────────────
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;

        priceLinesRef.current.forEach((line) => series.removePriceLine(line));
        priceLinesRef.current = [];
        series.setMarkers([]);

        if (!signal) return;

        const levels: { price: number; color: string; title: string }[] = [
            { price: signal.entry, color: ENTRY_COLOR, title: `ENTRY ${signal.entry.toFixed(priceDecimals)}` },
            { price: signal.stop, color: STOP_COLOR, title: `SL ${signal.stop.toFixed(priceDecimals)}` },
            { price: signal.target, color: TARGET_COLOR, title: `TP ${signal.target.toFixed(priceDecimals)}` },
        ];

        priceLinesRef.current = levels.map((l) =>
            series.createPriceLine({
                price: l.price,
                color: l.color,
                lineWidth: 2,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: l.title,
            }),
        );

        const marker: SeriesMarker<Time> = {
            time: (signal.timestamp / 1000) as UTCTimestamp,
            position: signal.side === 'long' ? 'belowBar' : 'aboveBar',
            color: signal.side === 'long' ? TARGET_COLOR : STOP_COLOR,
            shape: signal.side === 'long' ? 'arrowUp' : 'arrowDown',
            text: signal.side.toUpperCase(),
        };
        series.setMarkers([marker]);
    }, [signal, priceDecimals]);

    return <div ref={containerRef} className="signal-chart" />;
}
