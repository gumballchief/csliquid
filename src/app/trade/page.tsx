'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import LiveSkinCard from '@/components/market/LiveSkinCard';
import { FuturesMarket } from '@/types';

type FilterTab = 'All' | 'AWP' | 'AK-47' | 'Knives' | 'Gloves' | 'CS500';
type SortKey   = 'volume' | 'gainers' | 'losers' | 'price-high' | 'price-low';

const FILTER_TO_WEAPON: Record<FilterTab, string | null> = {
  All: null, AWP: 'AWP', 'AK-47': 'AK-47', Knives: 'Knife', Gloves: 'Glove', CS500: 'CS500',
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'volume',     label: 'Most Volume' },
  { value: 'gainers',    label: 'Top Gainers' },
  { value: 'losers',     label: 'Top Losers' },
  { value: 'price-high', label: 'Price: High → Low' },
  { value: 'price-low',  label: 'Price: Low → High' },
];

const BASE_MARKETS: FuturesMarket[] = [
  { skinId: 'awp-index',   skin: { id: 'awp-index',   name: 'AWP Index',   weapon: 'AWP',   category: 'Index', wear: 'Factory New', rarity: 'Covert', float: 0, imageUrl: '', collection: '' }, markPrice: 0, indexPrice: 0, fundingRate: 0, nextFunding: '--:--:--', openInterest: 0, volume24h: 0, priceChange24h: 0, priceChangePct24h: 0, high24h: 0, low24h: 0, priceHistory: [] },
  { skinId: 'ak47-index',  skin: { id: 'ak47-index',  name: 'AK-47 Index', weapon: 'AK-47', category: 'Index', wear: 'Factory New', rarity: 'Covert', float: 0, imageUrl: '', collection: '' }, markPrice: 0, indexPrice: 0, fundingRate: 0, nextFunding: '--:--:--', openInterest: 0, volume24h: 0, priceChange24h: 0, priceChangePct24h: 0, high24h: 0, low24h: 0, priceHistory: [] },
  { skinId: 'knife-index', skin: { id: 'knife-index', name: 'Knife Index', weapon: 'Knife', category: 'Index', wear: 'Factory New', rarity: 'Covert', float: 0, imageUrl: '', collection: '' }, markPrice: 0, indexPrice: 0, fundingRate: 0, nextFunding: '--:--:--', openInterest: 0, volume24h: 0, priceChange24h: 0, priceChangePct24h: 0, high24h: 0, low24h: 0, priceHistory: [] },
  { skinId: 'glove-index', skin: { id: 'glove-index', name: 'Glove Index', weapon: 'Glove', category: 'Index', wear: 'Factory New', rarity: 'Covert', float: 0, imageUrl: '', collection: '' }, markPrice: 0, indexPrice: 0, fundingRate: 0, nextFunding: '--:--:--', openInterest: 0, volume24h: 0, priceChange24h: 0, priceChangePct24h: 0, high24h: 0, low24h: 0, priceHistory: [] },
  { skinId: 'cs500-index', skin: { id: 'cs500-index', name: 'CS500 Index', weapon: 'CS500', category: 'Index', wear: 'Factory New', rarity: 'Covert', float: 0, imageUrl: '', collection: '' }, markPrice: 0, indexPrice: 0, fundingRate: 0, nextFunding: '--:--:--', openInterest: 0, volume24h: 0, priceChange24h: 0, priceChangePct24h: 0, high24h: 0, low24h: 0, priceHistory: [] },
];

function useFundingCountdown() {
  const [label, setLabel] = useState('--:--:--');
  useEffect(() => {
    function tick() {
      const now      = Date.now();
      const interval = 8 * 3600 * 1000;
      const next     = Math.ceil(now / interval) * interval;
      const diff     = next - now;
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setLabel(
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
      );
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);
  return label;
}

export default function TradePage() {
  const [search,    setSearch]    = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [sort,      setSort]      = useState<SortKey>('volume');
  const funding = useFundingCountdown();

  const filtered = useMemo(() => {
    const q      = search.trim().toLowerCase();
    const weapon = FILTER_TO_WEAPON[activeTab];
    return BASE_MARKETS
      .filter(m => {
        if (weapon && m.skin.weapon !== weapon) return false;
        if (q && !m.skin.name.toLowerCase().includes(q) && !m.skin.weapon.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [search, activeTab]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-tx-text">Markets</h1>
          <p className="text-[11px] font-mono text-tx-muted mt-0.5">
            Perpetual futures · CS2 skin indexes · USDC settlement
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.06em] text-tx-green bg-tx-green/10 border border-tx-green/20 px-2 py-1 rounded-sm">
          <span className="w-1.5 h-1.5 bg-tx-green animate-pulse" />
          Live
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden">
        <StatCard label="Markets"    value={BASE_MARKETS.length.toString()} />
        <StatCard label="24h Volume" value="—" />
        <StatCard label="Open Interest" value="—" />
        <StatCard label="Settlement" value="USDC" />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-tx-surface border border-tx-border rounded-sm shrink-0 ml-auto text-[11px] font-mono">
          <span className="w-1 h-1 bg-yellow-400 animate-pulse" />
          <span className="text-tx-dim uppercase tracking-wider">Funding</span>
          <span className="text-yellow-400 tabular-nums">{funding}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-dim w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full bg-tx-surface border border-tx-border rounded-sm pl-8 pr-3 py-1.5 text-[11px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx-dim hover:text-tx-muted text-[11px]">✕</button>
          )}
        </div>

        <div className="flex gap-px bg-tx-border rounded-sm overflow-hidden">
          {(['All', 'AWP', 'AK-47', 'Knives', 'Gloves', 'CS500'] as FilterTab[]).map(tab => (
            <div key={tab} className="flex items-center">
              <button
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.06em] transition-colors ${
                  activeTab === tab ? 'bg-tx-raised text-tx-green' : 'bg-tx-surface text-tx-dim hover:text-tx-muted'
                }`}
              >
                {tab}
              </button>
              {tab === 'CS500' && (
                <Link href="/cs500" className="px-1 text-tx-dim hover:text-tx-muted transition-colors" title="About CS500">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Link>
              )}
            </div>
          ))}
        </div>

        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="bg-tx-surface border border-tx-border text-tx-muted text-[10px] font-mono uppercase tracking-wider rounded-sm px-3 py-1.5 focus:outline-none focus:border-tx-border2 transition-colors cursor-pointer"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {filtered.length > 0 ? (
        <>
          <p className="text-[10px] font-mono text-tx-dim">
            {filtered.length} market{filtered.length !== 1 ? 's' : ''} · prices update every 30s
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filtered.map(market => (
              <LiveSkinCard key={market.skinId} market={market} />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-[11px] font-mono text-tx-muted uppercase tracking-wider">No markets found</p>
          <button
            onClick={() => { setSearch(''); setActiveTab('All'); }}
            className="mt-4 text-[10px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-green transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-tx-surface px-4 py-3">
      <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-1">{label}</p>
      <p className="text-[18px] font-mono font-bold text-tx-text tabular-nums">{value}</p>
    </div>
  );
}
