'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSkinPrice } from '@/hooks/useSkinPrice';
import {
  ALL_MARKETS, MarketDefinition, MarketType, TYPE_LABEL, TYPE_COLOR,
} from '@/lib/allMarkets';

type FilterTab = 'ALL' | 'INDEX' | 'RIFLE' | 'PISTOL' | 'KNIFE' | 'GLOVE' | 'CASE';
type SortKey   = 'default' | 'gainers' | 'losers' | 'volume' | 'price-high' | 'price-low';

const FILTER_TABS: FilterTab[] = ['ALL', 'INDEX', 'RIFLE', 'PISTOL', 'KNIFE', 'GLOVE', 'CASE'];

const SECTION_ORDER: MarketType[] = ['index', 'rifle', 'pistol', 'knife', 'glove', 'case'];
const SECTION_LABEL: Record<MarketType, string> = {
  index: 'Indices', rifle: 'Rifles', pistol: 'Pistols',
  knife: 'Knives', glove: 'Gloves', case: 'Cases',
};

function useFundingCountdown() {
  const [label, setLabel] = useState('--:--:--');
  useEffect(() => {
    function tick() {
      const now = Date.now(), interval = 8 * 3600 * 1000;
      const diff = Math.ceil(now / interval) * interval - now;
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setLabel(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);
  return label;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1)         return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function TypeBadge({ type }: { type: MarketType }) {
  const color = TYPE_COLOR[type];
  return (
    <span
      className="text-[8px] font-mono font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-sm border"
      style={{ color, borderColor: `${color}40`, background: `${color}15` }}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

function MarketIcon({ market }: { market: MarketDefinition }) {
  const color = TYPE_COLOR[market.type];
  const letter = market.ticker.slice(0, 2);
  if (market.iconUrl) {
    return (
      <div className="w-10 h-10 rounded-sm overflow-hidden shrink-0 border" style={{ borderColor: `${color}40` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/img?url=${encodeURIComponent(market.iconUrl)}`}
          alt={market.shortName}
          width={40}
          height={40}
          className="w-full h-full object-cover"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    );
  }
  return (
    <div
      className="w-10 h-10 rounded-sm flex items-center justify-center border shrink-0"
      style={{ background: `${color}15`, borderColor: `${color}40` }}
    >
      <span className="text-[10px] font-mono font-black" style={{ color }}>
        {letter}
      </span>
    </div>
  );
}

function MarketCard({ market }: { market: MarketDefinition }) {
  const live = useSkinPrice(market.slug);
  const price = live.markPrice > 0 ? live.markPrice : market.approxPrice;
  const pct   = live.changePct24h;
  const up    = pct >= 0;
  const isLive = live.markPrice > 0;

  return (
    <Link href={`/trade/${market.slug}`} className="block group focus:outline-none">
      <article className="bg-tx-surface border border-tx-border rounded hover:border-tx-border2 transition-all duration-150 group-hover:shadow-lg group-hover:shadow-black/20">
        {/* Header */}
        <div className="px-3 pt-3 pb-2.5 flex items-start justify-between border-b border-tx-border gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MarketIcon market={market} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <TypeBadge type={market.type} />
                {!market.onChain && (
                  <span className="text-[7px] font-mono text-yellow-500/70 uppercase tracking-wider">DEMO</span>
                )}
              </div>
              <p className="text-[11px] font-mono text-tx-muted truncate leading-tight" title={market.shortName}>
                {market.shortName}
              </p>
            </div>
          </div>
          {isLive ? (
            <span className={`shrink-0 text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-sm ${
              up ? 'text-tx-green bg-tx-green/10' : 'text-tx-red bg-tx-red/10'
            }`}>
              {up ? '+' : ''}{pct.toFixed(2)}%
            </span>
          ) : (
            <span className="shrink-0 text-[10px] font-mono text-tx-dim tabular-nums px-1.5 py-0.5">—</span>
          )}
        </div>

        {/* Price */}
        <div className="px-3 py-3">
          <p className="text-[20px] font-mono font-bold text-tx-text tabular-nums leading-none">
            {fmt(price)}
          </p>
          <p className="text-[10px] font-mono text-tx-dim mt-1">
            {market.ticker} · PERP
          </p>
        </div>

        {/* CTA */}
        <div className="border-t border-tx-border px-3 py-2 text-center text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim group-hover:text-tx-green transition-colors">
          {market.onChain ? 'Trade →' : 'View Chart →'}
        </div>
      </article>
    </Link>
  );
}

function Section({ type, markets }: { type: MarketType; markets: MarketDefinition[] }) {
  if (markets.length === 0) return null;
  const color = TYPE_COLOR[type];
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[10px] font-mono uppercase tracking-[0.1em] font-bold" style={{ color }}>
          {SECTION_LABEL[type]}
        </h2>
        <span className="text-[9px] font-mono text-tx-dim">{markets.length} market{markets.length !== 1 ? 's' : ''}</span>
        <div className="flex-1 h-px bg-tx-border" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {markets.map(m => <MarketCard key={m.slug} market={m} />)}
      </div>
    </section>
  );
}

export default function TradePage() {
  const [search,    setSearch]    = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [sort,      setSort]      = useState<SortKey>('default');
  const funding = useFundingCountdown();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_MARKETS.filter(m => {
      if (activeTab !== 'ALL' && m.type.toUpperCase() !== activeTab) return false;
      if (q) {
        const haystack = `${m.slug} ${m.name} ${m.ticker} ${m.type}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [search, activeTab]);

  // Group for sections view (only when not sorting or searching)
  const grouped = useMemo(() => {
    const out: Record<MarketType, MarketDefinition[]> = {
      index: [], rifle: [], pistol: [], knife: [], glove: [], case: [],
    };
    for (const m of filtered) out[m.type].push(m);
    return out;
  }, [filtered]);

  const showSections = activeTab === 'ALL' && !search && sort === 'default';

  return (
    <main className="max-w-7xl mx-auto px-4 py-4 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-tx-text">Markets</h1>
          <p className="text-[11px] font-mono text-tx-muted mt-0.5">
            {ALL_MARKETS.length} perpetual markets · CS2 skins &amp; indices · USDC settlement
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.06em] text-tx-green bg-tx-green/10 border border-tx-green/20 px-2 py-1 rounded-sm">
          <span className="w-1.5 h-1.5 bg-tx-green animate-pulse" />
          Live
        </span>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden">
        <StatCard label="Total Markets"  value={String(ALL_MARKETS.length)} />
        <StatCard label="24h Volume"     value="—" />
        <StatCard label="Open Interest"  value="—" />
        <StatCard label="Settlement"     value="USDC" />
      </div>

      {/* Funding countdown */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-tx-surface border border-tx-border rounded-sm text-[11px] font-mono">
          <span className="w-1 h-1 bg-yellow-400 animate-pulse" />
          <span className="text-tx-dim uppercase tracking-wider">Funding</span>
          <span className="text-yellow-400 tabular-nums">{funding}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-dim w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search markets…"
            className="w-full bg-tx-surface border border-tx-border rounded-sm pl-8 pr-3 py-1.5 text-[11px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-tx-dim hover:text-tx-muted text-[11px]">✕</button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-px bg-tx-border rounded-sm overflow-hidden overflow-x-auto">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.06em] transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-tx-raised text-tx-green'
                  : 'bg-tx-surface text-tx-dim hover:text-tx-muted'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="bg-tx-surface border border-tx-border text-tx-muted text-[10px] font-mono uppercase tracking-wider rounded-sm px-3 py-1.5 focus:outline-none focus:border-tx-border2 transition-colors cursor-pointer"
        >
          <option value="default">Default</option>
          <option value="gainers">Top Gainers</option>
          <option value="losers">Top Losers</option>
          <option value="price-high">Price ↑</option>
          <option value="price-low">Price ↓</option>
        </select>
      </div>

      {/* Market count */}
      {(search || activeTab !== 'ALL') && (
        <p className="text-[10px] font-mono text-tx-dim">
          {filtered.length} market{filtered.length !== 1 ? 's' : ''} · prices update every 30s
        </p>
      )}

      {/* Grid — sectioned or flat */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-[11px] font-mono text-tx-muted uppercase tracking-wider">No markets found</p>
          <button
            onClick={() => { setSearch(''); setActiveTab('ALL'); setSort('default'); }}
            className="mt-4 text-[10px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-green transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : showSections ? (
        <div className="space-y-8">
          {SECTION_ORDER.map(type => (
            <Section key={type} type={type} markets={grouped[type]} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {filtered.map(m => <MarketCard key={m.slug} market={m} />)}
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
