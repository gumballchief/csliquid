'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { generateCandles, OHLCCandle } from '@/lib/generateCandles';
import { PriceRange, PriceHistories } from '@/services/skinPriceService';

type Range = PriceRange;

const RANGES: { id: Range; hours: number; count: number; label: string }[] = [
  { id: '1H', hours: 1 / 60,  count: 240, label: '1H' },  // 1-min candles, ~4h visible
  { id: '4H', hours: 5 / 60,  count: 200, label: '4H' },  // 5-min candles, ~16h visible
  { id: '1D', hours: 0.5,     count: 200, label: '1D' },  // 30-min candles, ~4 days visible
  { id: '1W', hours: 4,       count: 210, label: '1W' },  // 4-hr candles, ~35 days visible
];

export interface ChartPosition {
  direction:  'LONG' | 'SHORT';
  entryPrice: number;
  liqPrice:   number;
  size:       number;
}

interface Props {
  markPrice:          number;
  skinName:           string;
  externalHistories?: PriceHistories;
  openPosition?:      ChartPosition | null;
}

export default function PriceChart({ markPrice, skinName, externalHistories, openPosition }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lcRef        = useRef<any>(null);   // holds the dynamically-imported lc module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entryLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liqLineRef   = useRef<any>(null);
  const rangeRef     = useRef<Range>('4H');
  // Ref so the chart-init effect (mount-only) always reads the latest allData
  // without being re-run when allData changes (which would recreate the chart).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allDataRef   = useRef<Record<Range, any[]>>({} as any);

  const [activeRange, setActiveRange] = useState<Range>('4H');
  const [isReady, setIsReady] = useState(false);
  const [hover, setHover] = useState<{ o: number; h: number; l: number; c: number } | null>(null);

  // allData: always use externalHistories (from useMarketPrice, last candle already patched).
  // Fall back to generated candles only if nothing provided yet.
  const allData = useMemo<Record<Range, OHLCCandle[]>>(
    () =>
      (externalHistories && Object.values(externalHistories).some(h => h.length > 0))
        ? externalHistories
        : (Object.fromEntries(
            RANGES.map(r => [r.id, generateCandles(markPrice || 100, r.hours, r.count)])
          ) as Record<Range, OHLCCandle[]>),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalHistories, Math.round(markPrice)],
  );
  allDataRef.current = allData;

  // Update series when allData changes (price update or range histories change).
  useEffect(() => {
    if (!seriesRef.current) return;
    const data = allDataRef.current[rangeRef.current];
    if (!data?.length) return;
    seriesRef.current.setData(
      data.map(({ time, open, high, low, close }) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        time: time as any, open, high, low, close,
      })),
    );
  }, [allData]);

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;
    let ro: ResizeObserver | null = null;

    import('lightweight-charts').then((lc) => {
      if (!mounted || !containerRef.current) return;

      const chart = lc.createChart(containerRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: '#0a0b0d' },
          textColor: '#6b7280',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: '#1a1d23' },
          horzLines: { color: '#1a1d23' },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: '#2a2d35', labelBackgroundColor: '#111214', width: 1 },
          horzLine: { color: '#2a2d35', labelBackgroundColor: '#111214', width: 1 },
        },
        rightPriceScale: {
          borderColor: '#1e2025',
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
        timeScale: {
          borderColor: '#1e2025',
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
        width:  containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale:  { mouseWheel: true, pinch: true },
      });

      const series = chart.addSeries(lc.CandlestickSeries, {
        upColor:       '#00ff88',
        downColor:     '#ff4444',
        borderVisible: false,
        wickUpColor:   '#00ff88',
        wickDownColor: '#ff4444',
      });

      const initialData = allDataRef.current[rangeRef.current] ?? [];
      series.setData(initialData.map(({ time, open, high, low, close }) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        time: time as any, open, high, low, close,
      })));
      chart.timeScale().fitContent();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chart.subscribeCrosshairMove((param: any) => {
        if (!param.point || !param.seriesData?.size) {
          setHover(null);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bar = param.seriesData.get(series) as any;
        if (bar) setHover({ o: bar.open, h: bar.high, l: bar.low, c: bar.close });
      });

      ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.resize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
          );
        }
      });
      ro.observe(containerRef.current);

      chartRef.current  = chart;
      seriesRef.current = series;
      lcRef.current     = lc;
      if (mounted) setIsReady(true);
    });

    return () => {
      mounted = false;
      ro?.disconnect();
      chartRef.current?.remove();
      chartRef.current  = null;
      seriesRef.current = null;
      lcRef.current     = null;
      entryLineRef.current = null;
      liqLineRef.current   = null;
    };
  }, []); // mount-only

  // Range change: swap data and fit
  useEffect(() => {
    rangeRef.current = activeRange;
    if (!seriesRef.current || !chartRef.current) return;
    const data = allDataRef.current[activeRange] ?? [];
    seriesRef.current.setData(
      data.map(({ time, open, high, low, close }) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        time: time as any, open, high, low, close,
      })),
    );
    chartRef.current.timeScale().fitContent();
  }, [activeRange]);

  // Draw / update entry and liquidation price lines when position changes
  useEffect(() => {
    if (!seriesRef.current || !lcRef.current || !isReady) return;
    const series = seriesRef.current;
    const lc     = lcRef.current;

    if (entryLineRef.current) {
      try { series.removePriceLine(entryLineRef.current); } catch {}
      entryLineRef.current = null;
    }
    if (liqLineRef.current) {
      try { series.removePriceLine(liqLineRef.current); } catch {}
      liqLineRef.current = null;
    }

    if (!openPosition) return;

    const isLong = openPosition.direction === 'LONG';
    entryLineRef.current = series.createPriceLine({
      price:            openPosition.entryPrice,
      color:            isLong ? '#00ff88' : '#ff4444',
      lineWidth:        1,
      lineStyle:        lc.LineStyle.Dashed,
      axisLabelVisible: true,
      title:            isLong ? '▲ LONG' : '▼ SHORT',
    });
    liqLineRef.current = series.createPriceLine({
      price:            openPosition.liqPrice,
      color:            '#ff7700',
      lineWidth:        1,
      lineStyle:        lc.LineStyle.Dotted,
      axisLabelVisible: true,
      title:            'LIQ',
    });
  }, [openPosition, isReady]);

  const last = allData[activeRange].at(-1);
  const display = hover ?? (last ? { o: last.open, h: last.high, l: last.low, c: last.close } : null);
  const upColor = display && display.c >= display.o ? '#22c55e' : '#ef4444';

  // Live PnL — updates every time markPrice changes
  const livePnl = openPosition && markPrice > 0
    ? openPosition.direction === 'LONG'
      ? (markPrice - openPosition.entryPrice) * openPosition.size
      : (openPosition.entryPrice - markPrice) * openPosition.size
    : null;

  return (
    <div className="flex flex-col bg-tx-bg border border-tx-border overflow-hidden rounded">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-tx-border shrink-0 gap-4 bg-tx-surface">
        {/* Left: name + position summary + OHLC */}
        <div className="flex items-center gap-4 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-tx-muted truncate">{skinName}</span>
            <span className="text-[9px] bg-tx-raised text-tx-dim px-1.5 py-0.5 rounded-sm font-mono tracking-wider">PERP</span>
          </div>

          {/* Live position badge — direction, entry price, real-time PnL */}
          {openPosition && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border ${
                openPosition.direction === 'LONG'
                  ? 'bg-tx-green/10 border-tx-green/20 text-tx-green'
                  : 'bg-tx-red/10 border-tx-red/20 text-tx-red'
              }`}>
                {openPosition.direction === 'LONG' ? '▲' : '▼'} {openPosition.direction}
              </span>
              <span className="text-[10px] font-mono text-tx-dim tabular-nums">
                @${openPosition.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              {livePnl !== null && (
                <span className={`text-[11px] font-mono font-bold tabular-nums ${livePnl >= 0 ? 'text-tx-green' : 'text-tx-red'}`}>
                  {livePnl >= 0 ? '+' : ''}${livePnl.toFixed(2)}
                </span>
              )}
            </div>
          )}

          {display && !openPosition && (
            <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono tabular-nums">
              <span className="text-tx-dim">O <span className="text-tx-muted">{display.o.toFixed(2)}</span></span>
              <span className="text-tx-dim">H <span style={{ color: upColor }}>{display.h.toFixed(2)}</span></span>
              <span className="text-tx-dim">L <span style={{ color: upColor }}>{display.l.toFixed(2)}</span></span>
              <span className="text-tx-dim">C <span style={{ color: upColor }} className="font-bold">{display.c.toFixed(2)}</span></span>
            </div>
          )}
        </div>

        {/* Range tabs */}
        <div className="flex gap-px bg-tx-border shrink-0 rounded-sm overflow-hidden">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setActiveRange(r.id)}
              className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.05em] transition-colors ${
                activeRange === r.id
                  ? 'bg-tx-raised text-tx-green'
                  : 'bg-tx-surface text-tx-dim hover:text-tx-muted'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="relative">
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-tx-bg z-10">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 h-1 bg-tx-border animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
        {/* OHLC readout on hover when position is showing (no room in toolbar) */}
        {display && openPosition && (
          <div className="absolute top-2 right-3 z-10 flex items-center gap-3 text-[10px] font-mono tabular-nums bg-tx-bg/80 px-2 py-1 rounded-sm pointer-events-none">
            <span className="text-tx-dim">O <span className="text-tx-muted">{display.o.toFixed(2)}</span></span>
            <span className="text-tx-dim">H <span style={{ color: upColor }}>{display.h.toFixed(2)}</span></span>
            <span className="text-tx-dim">L <span style={{ color: upColor }}>{display.l.toFixed(2)}</span></span>
            <span className="text-tx-dim">C <span style={{ color: upColor }}>{display.c.toFixed(2)}</span></span>
          </div>
        )}
        <div ref={containerRef} className="h-[440px]" />
      </div>
    </div>
  );
}
