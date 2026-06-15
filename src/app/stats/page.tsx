'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSkinPrice } from '@/hooks/useSkinPrice';

const MARKET_IDS = ['awp-index', 'ak47-index', 'knife-index', 'glove-index', 'cs500-index'];
const INDEX_IDS  = ['AWP', 'AK47', 'KNIFE', 'GLOVE', 'CS500'] as const;
type IndexId = (typeof INDEX_IDS)[number];

const MARKET_LABELS: Record<string, string> = {
  'awp-index':   'AWP',
  'ak47-index':  'AK-47',
  'knife-index': 'Knife',
  'glove-index': 'Glove',
  'cs500-index': 'CS500',
};

const SKIN_TO_INDEX: Record<string, IndexId> = {
  'awp-index': 'AWP', 'ak47-index': 'AK47',
  'knife-index': 'KNIFE', 'glove-index': 'GLOVE', 'cs500-index': 'CS500',
};

interface PoolStats {
  initialized: boolean;
  totalUsdc:   number;
  feesEarned:  number;
  apr7d:       number;
  sharePrice:  number;
}

interface OracleStatus {
  price:       number;
  publishedAt: number;
  ageSec:      number;
  healthy:     boolean;
  longOI:      number;
  shortOI:     number;
  fundingRate: number;
  initialized: boolean;
}

interface PriceHistory {
  prices:     number[];
  timestamps: number[];
}

function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtAge(sec: number): string {
  if (!isFinite(sec)) return 'never';
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}
function fmtPrice(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function useAllPrices() {
  const awp   = useSkinPrice('awp-index');
  const ak47  = useSkinPrice('ak47-index');
  const knife = useSkinPrice('knife-index');
  const glove = useSkinPrice('glove-index');
  const cs500 = useSkinPrice('cs500-index');
  return [awp, ak47, knife, glove, cs500];
}

// Simple SVG sparkline
function MiniChart({ prices, height = 56 }: { prices: number[]; height?: number }) {
  if (prices.length < 2) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height }}>
        <span className="text-[10px] font-mono text-tx-dim">No price history yet</span>
      </div>
    );
  }
  const W = 600;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = height - ((p - min) / range) * height * 0.85 - height * 0.05;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const up = prices[prices.length - 1] >= prices[0];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? '#00ff88' : '#ff4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StatsPage() {
  const [pool,          setPool]          = useState<PoolStats | null>(null);
  const [oracleData,    setOracleData]    = useState<Record<string, OracleStatus>>({});
  const [priceHistory,  setPriceHistory]  = useState<Record<string, PriceHistory>>({});
  const [activeMarket,  setActiveMarket]  = useState<string>('awp-index');
  const [uptimeStart]                     = useState(() => Date.now());
  const [now,           setNow]           = useState(() => Date.now());
  const prices = useAllPrices();

  useEffect(() => {
    fetch('/api/pool/stats').then(r => r.json()).then(setPool).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/oracle-status')
      .then(r => r.json())
      .then(setOracleData)
      .catch(() => {});
    const id = setInterval(() => {
      fetch('/api/oracle-status').then(r => r.json()).then(setOracleData).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function fetchHistory() {
      const results: Record<string, PriceHistory> = {};
      for (const indexId of INDEX_IDS) {
        try {
          const r = await fetch(`/api/price-history?market=${indexId}`);
          results[indexId] = await r.json();
        } catch {}
      }
      setPriceHistory(results);
    }
    fetchHistory();
    const id = setInterval(fetchHistory, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  const totalVol24h = prices.reduce((s, p) => s + p.volume24h, 0);
  const fees24h     = pool ? pool.feesEarned : 0;
  const tvl         = pool ? pool.totalUsdc  : 0;
  const apr         = pool ? pool.apr7d      : 0;

  const activeIndexId    = SKIN_TO_INDEX[activeMarket];
  const activeOracle     = activeIndexId ? oracleData[activeIndexId] : null;
  const activeHistory    = activeIndexId ? priceHistory[activeIndexId] : null;
  const activePrice      = prices[MARKET_IDS.indexOf(activeMarket)];
  const uptimeSec        = Math.round((now - uptimeStart) / 1000);

  // Derive session high/low from live price + history
  const histPrices    = activeHistory?.prices ?? [];
  const allPrices     = activeOracle?.price ? [...histPrices, activeOracle.price] : histPrices;
  const sessionHigh   = allPrices.length > 0 ? Math.max(...allPrices) : 0;
  const sessionLow    = allPrices.length > 0 ? Math.min(...allPrices) : 0;

  function fmtUptime(sec: number) {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-tx-text">Protocol Stats</h1>
          <p className="text-[11px] font-mono text-tx-muted mt-0.5">Live data · updates every 30s</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.06em] text-tx-green bg-tx-green/10 border border-tx-green/20 px-2 py-1 rounded-sm">
          <span className="w-1.5 h-1.5 bg-tx-green animate-pulse" />
          Live
        </span>
      </div>

      {/* Top protocol stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">
        <StatCard label="Pool TVL"    value={tvl > 0 ? fmtM(tvl) : '—'} sub="Total liquidity deposited" />
        <StatCard label="Fees Earned" value={fees24h > 0 ? fmtM(fees24h) : '—'} sub="0.05% taker fee on all volume" />
        <div className="bg-tx-surface px-5 py-4 col-span-2 lg:col-span-1">
          <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-1">24h Volume</p>
          <p className="text-[20px] font-mono font-bold text-tx-text tabular-nums mb-1">
            {totalVol24h > 0 ? fmtM(totalVol24h) : '—'}
          </p>
          <p className="text-[10px] font-mono text-tx-dim">All markets combined</p>
        </div>
        <StatCard label="Pool APR (7d)" value={apr > 0 ? `${apr.toFixed(1)}%` : '—'} sub="LP fee yield annualized" />
        <StatCard label="Active Positions" value="0" sub="Across all markets" />
        <StatCard label="Unique Traders"   value="0" sub="Wallets that have traded" />
      </div>

      {/* ── MARKET ORACLE PANEL ── */}
      <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">

        {/* Market tab bar */}
        <div className="flex border-b border-tx-border overflow-x-auto">
          {MARKET_IDS.map(id => (
            <button
              key={id}
              onClick={() => setActiveMarket(id)}
              className={`px-4 h-9 flex-shrink-0 text-[10px] font-mono uppercase tracking-[0.08em] transition-colors border-b-2 ${
                activeMarket === id
                  ? 'text-tx-green border-tx-green'
                  : 'text-tx-dim hover:text-tx-muted border-transparent'
              }`}
            >
              {MARKET_LABELS[id]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-y lg:divide-y-0 lg:divide-x divide-tx-border">

          {/* Price history chart */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-tx-muted">
                Price History — last {histPrices.length > 0 ? histPrices.length : '—'} updates
              </p>
              {activeOracle?.price ? (
                <span className="text-[13px] font-mono font-bold text-tx-text tabular-nums">
                  ${fmtPrice(activeOracle.price)}
                </span>
              ) : null}
            </div>
            <div className="bg-tx-bg border border-tx-border rounded-sm overflow-hidden px-1 pt-2 pb-1">
              <MiniChart prices={histPrices.length > 0 ? histPrices : (activeOracle?.price ? [activeOracle.price] : [])} height={72} />
            </div>
            <div className="grid grid-cols-3 gap-px mt-2 bg-tx-border rounded-sm overflow-hidden">
              <div className="bg-tx-bg px-3 py-2">
                <p className="text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim">Session High</p>
                <p className="text-[11px] font-mono font-bold text-tx-text tabular-nums mt-0.5">
                  {sessionHigh > 0 ? `$${fmtPrice(sessionHigh)}` : '—'}
                </p>
              </div>
              <div className="bg-tx-bg px-3 py-2">
                <p className="text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim">Session Low</p>
                <p className="text-[11px] font-mono font-bold text-tx-text tabular-nums mt-0.5">
                  {sessionLow > 0 ? `$${fmtPrice(sessionLow)}` : '—'}
                </p>
              </div>
              <div className="bg-tx-bg px-3 py-2">
                <p className="text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim">Uptime</p>
                <p className="text-[11px] font-mono font-bold text-tx-green tabular-nums mt-0.5">
                  {fmtUptime(uptimeSec)}
                </p>
              </div>
            </div>
          </div>

          {/* Oracle status */}
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-3">Oracle Status</p>
              <div className="space-y-2.5">
                <OracleRow label="Current Price"
                  value={activeOracle?.price ? `$${fmtPrice(activeOracle.price)}` : '—'} />
                <OracleRow label="Source" value="CSFloat / Skinport" />
                <OracleRow label="Last Update"
                  value={activeOracle ? fmtAge(activeOracle.ageSec) : '—'} />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-tx-dim uppercase tracking-[0.06em]">Oracle Status</span>
                  {activeOracle ? (
                    <span className={`text-[10px] font-mono font-bold ${activeOracle.healthy ? 'text-tx-green' : 'text-tx-red'}`}>
                      ● {activeOracle.healthy ? 'Healthy' : 'Degraded'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-tx-dim">—</span>
                  )}
                </div>
                <OracleRow label="Smoothing" value="Adaptive EWMA" />
                <OracleRow label="Funding Rate"
                  value={activeOracle ? `${(activeOracle.fundingRate * 100).toFixed(4)}%/hr` : '—'} />
              </div>
            </div>

            {/* Open interest */}
            {activeOracle && (activeOracle.longOI > 0 || activeOracle.shortOI > 0) && (() => {
              const total   = activeOracle.longOI + activeOracle.shortOI;
              const longPct = Math.round((activeOracle.longOI / total) * 100);
              return (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-2">Open Interest</p>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono text-tx-green">LONG {longPct}%</span>
                    <span className="text-[9px] font-mono text-tx-red">SHORT {100 - longPct}%</span>
                  </div>
                  <div className="h-1.5 flex rounded-sm overflow-hidden">
                    <div className="bg-tx-green" style={{ width: `${longPct}%` }} />
                    <div className="bg-tx-red"   style={{ width: `${100 - longPct}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] font-mono text-tx-dim tabular-nums">L: {fmtShort(activeOracle.longOI)}</span>
                    <span className="text-[9px] font-mono text-tx-dim tabular-nums">S: {fmtShort(activeOracle.shortOI)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── PROTOCOL PARAMETERS ── */}
      <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
        <div className="px-5 py-3 border-b border-tx-border">
          <h2 className="text-[10px] font-mono uppercase tracking-[0.08em] text-tx-muted">Protocol Parameters</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-tx-border">
          {[
            { label: 'Trade Fee',              value: '2.00%'       },
            { label: 'Liq. Threshold',         value: '5%'          },
            { label: 'Base Funding Rate',      value: '0.24%/24h'   },
            { label: 'Insurance Fund Rate',    value: '25%'         },
            { label: 'Min Position Size',      value: '$1.00'       },
            { label: 'Max Leverage',           value: '20×'         },
            { label: 'Profit Cap',             value: '300%'        },
            { label: 'Protocol Paused',        value: 'NO', cls: 'text-tx-green' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-tx-surface px-4 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-1">{label}</p>
              <p className={`text-[13px] font-mono font-bold tabular-nums ${cls ?? 'text-tx-text'}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── MARKETS TABLE ── */}
      <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
        <div className="px-5 py-3 border-b border-tx-border">
          <h2 className="text-[10px] font-mono uppercase tracking-[0.08em] text-tx-muted">Markets</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-tx-border">
                {['Market', 'Mark Price', '24h Change', '24h Volume', 'Funding Rate'].map(h => (
                  <th key={h} className={`px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim whitespace-nowrap ${h === 'Market' ? 'text-left' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prices.map((p, i) => {
                const id  = MARKET_IDS[i];
                const up  = p.changePct24h >= 0;
                const fup = p.fundingRate >= 0;
                return (
                  <tr key={id} className="border-b border-tx-border/50 last:border-b-0 hover:bg-tx-raised transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/trade/${id}`} className="group flex items-center gap-2">
                        <div className="w-6 h-6 bg-tx-raised border border-tx-border flex items-center justify-center shrink-0">
                          <span className="text-[8px] font-mono font-black text-tx-muted">{MARKET_LABELS[id].slice(0,2).toUpperCase()}</span>
                        </div>
                        <p className="text-[11px] font-mono text-tx-text group-hover:text-tx-green transition-colors">
                          {MARKET_LABELS[id]}-INDEX-PERP
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[11px] font-mono tabular-nums text-tx-text">
                        {p.markPrice > 0 ? `$${p.markPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.markPrice > 0 ? (
                        <span className={`text-[11px] font-mono tabular-nums font-bold ${up ? 'text-tx-green' : 'text-tx-red'}`}>
                          {up ? '▲' : '▼'} {Math.abs(p.changePct24h).toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-tx-dim">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[11px] font-mono tabular-nums text-tx-muted">
                        {p.volume24h > 0 ? fmtShort(p.volume24h) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.markPrice > 0 ? (
                        <span className={`text-[11px] font-mono tabular-nums ${fup ? 'text-tx-green' : 'text-tx-red'}`}>
                          {fup ? '+' : ''}{(p.fundingRate * 100).toFixed(4)}%
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-tx-dim">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-tx-surface px-5 py-4">
      <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-1">{label}</p>
      <p className="text-[20px] font-mono font-bold text-tx-text tabular-nums mb-1">{value}</p>
      {sub && <div className="text-[10px] font-mono text-tx-dim">{sub}</div>}
    </div>
  );
}

function OracleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono text-tx-dim uppercase tracking-[0.06em]">{label}</span>
      <span className="text-[10px] font-mono text-tx-muted tabular-nums">{value}</span>
    </div>
  );
}
