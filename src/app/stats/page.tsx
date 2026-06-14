'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSkinPrice } from '@/hooks/useSkinPrice';

const MARKET_IDS = ['awp-index', 'ak47-index', 'knife-index', 'glove-index', 'cs500-index'];
const MARKET_LABELS: Record<string, string> = {
  'awp-index':   'AWP',
  'ak47-index':  'AK-47',
  'knife-index': 'Knife',
  'glove-index': 'Glove',
  'cs500-index': 'CS500',
};

interface PoolStats {
  initialized: boolean;
  totalUsdc:   number;
  feesEarned:  number;
  apr7d:       number;
  sharePrice:  number;
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

function useAllPrices() {
  const awp   = useSkinPrice('awp-index');
  const ak47  = useSkinPrice('ak47-index');
  const knife = useSkinPrice('knife-index');
  const glove = useSkinPrice('glove-index');
  const cs500 = useSkinPrice('cs500-index');
  return [awp, ak47, knife, glove, cs500];
}

export default function StatsPage() {
  const [pool, setPool] = useState<PoolStats | null>(null);
  const prices = useAllPrices();

  useEffect(() => {
    fetch('/api/pool/stats')
      .then(r => r.json())
      .then(setPool)
      .catch(() => {});
  }, []);

  const totalVol24h = prices.reduce((s, p) => s + p.volume24h, 0);
  const fees24h     = pool ? pool.feesEarned : 0;
  const tvl         = pool ? pool.totalUsdc  : 0;
  const apr         = pool ? pool.apr7d      : 0;

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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">

        <StatCard label="Pool TVL"    value={tvl > 0 ? fmtM(tvl) : '—'} sub="Total liquidity deposited" />

        <StatCard
          label="Fees Earned"
          value={fees24h > 0 ? fmtM(fees24h) : '—'}
          sub="0.05% taker fee on all volume"
        />

        <div className="bg-tx-surface px-5 py-4 col-span-2 lg:col-span-1">
          <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-1">24h Volume</p>
          <p className="text-[20px] font-mono font-bold text-tx-text tabular-nums mb-1">
            {totalVol24h > 0 ? fmtM(totalVol24h) : '—'}
          </p>
          <p className="text-[10px] font-mono text-tx-dim">All markets combined</p>
        </div>

        <StatCard label="Pool APR (7d)" value={apr > 0 ? `${apr.toFixed(1)}%` : '—'} sub="LP fee yield annualized" />
        <StatCard label="Active Positions" value="0" sub="Across all markets" />
        <StatCard label="Unique Traders" value="0" sub="Wallets that have traded" />
      </div>

      {/* Markets table */}
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
