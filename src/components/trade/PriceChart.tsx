'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { generateCandles, OHLCCandle } from '@/lib/generateCandles';
import { PriceRange, PriceHistories } from '@/services/skinPriceService';

type Range = PriceRange;

const RANGES: { id: Range; hours: number; count: number; label: string }[] = [
  { id: '1H', hours: 1,   count: 72,  label: '1H' },
  { id: '4H', hours: 4,   count: 90,  label: '4H' },
  { id: '1D', hours: 24,  count: 60,  label: '1D' },
  { id: '1W', hours: 168, count: 52,  label: '1W' },
];

interface Props {
  markPrice:         number;
  skinName:          string;
  externalHistories?: PriceHistories;
}

export default function PriceChart({ markPrice, skinName, externalHistories }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<any>(null);
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
    // Regenerate when price/histories change (markPrice rounded to avoid thrash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalHistories, Math.round(markPrice)],
  );
  // Keep ref in sync so mount-only init effect always reads current data.
  allDataRef.current = allData;

  // Update series when allData changes (price update or range histories change).
  // Do NOT fitContent — preserve the user's current view position.
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

      // Crosshair tooltip
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

      // Responsive resize
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
      if (mounted) setIsReady(true);
    });

    return () => {
      mounted = false;
      ro?.disconnect();
      chartRef.current?.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []); // mount-only — allData updates go through the effect above

  // When range tab changes: swap data and fit the new range into view.
  // Reads from allDataRef so it always gets the latest candles, not a stale closure.
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

  const last = allData[activeRange].at(-1);
  const display = hover ?? (last ? { o: last.open, h: last.high, l: last.low, c: last.close } : null);
  const upColor = display && display.c >= display.o ? '#22c55e' : '#ef4444';

  return (
    <div className="flex flex-col bg-tx-bg border border-tx-border overflow-hidden rounded">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-tx-border shrink-0 gap-4 bg-tx-surface">
        {/* OHLC readout */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-tx-muted truncate">{skinName}</span>
            <span className="text-[9px] bg-tx-raised text-tx-dim px-1.5 py-0.5 rounded-sm font-mono tracking-wider">PERP</span>
          </div>
          {display && (
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
        <div ref={containerRef} className="h-[440px]" />
      </div>
    </div>
  );
}
