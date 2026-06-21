'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSkinPrice } from '@/hooks/useSkinPrice';
import { INDEX_DEFINITIONS } from '@/lib/indexes';

const BG     = '#0a0b0d';
const SURF   = '#111214';
const BORDER = '#1e2025';
const GREEN  = '#00ff88';
const ORANGE = '#f97316';
const TEXT   = '#e8eaed';
const MUTED  = '#6b7280';
const DIM    = '#374151';

type IndexTab = 'cs500-index' | 'awp-index' | 'ak47-index' | 'knife-index' | 'glove-index';

const INDEX_TABS: { id: IndexTab; label: string; ticker: string }[] = [
  { id: 'cs500-index',  label: 'CS500',    ticker: 'CS500'    },
  { id: 'awp-index',   label: 'AWP Index', ticker: 'AWP-IDX'  },
  { id: 'ak47-index',  label: 'AK-47 Index', ticker: 'AK-IDX' },
  { id: 'knife-index', label: 'Knife Index', ticker: 'KNF-IDX' },
  { id: 'glove-index', label: 'Glove Index', ticker: 'GLV-IDX' },
];

const INDEX_METHODOLOGY: Record<IndexTab, {
  description: string;
  bullets: string[];
  divisor?: string;
  basketSize: number;
}> = {
  'cs500-index': {
    description: 'Price-weighted index of 25 flagship CS2 skins spanning all market tiers. Analogous to the Dow Jones Industrial Average — calculated as the sum of constituent median prices divided by a fixed divisor.',
    basketSize: 25,
    divisor: '3.5',
    bullets: [
      'Fixed basket of 25 skins spanning ultra-premium ($1,000+) to budget ($5–$50)',
      'DJIA-style: index = sum(median listing price per skin) / divisor (3.5)',
      'Divisor scales proportionally when Steam rate-limiting reduces successful fetches',
      'Prices sourced from Steam Community Market API every ~5 minutes',
      'EWMA smoothing: α=0.05, max ±3% price change per update cycle',
      'Baseline persisted in Vercel KV across serverless cold-starts',
      'Target range $2,000–$5,000 at mid-2025 market prices',
    ],
  },
  'awp-index': {
    description: 'Volume-weighted average price index of the 10 most-traded AWP skins on the Steam Community Market.',
    basketSize: 10,
    bullets: [
      'Equal-weight average of midpoint prices across 10 AWP skin variants',
      'Midpoint = (lowest listing + median sale) / 2 for each constituent',
      'Skins selected by historical Steam market volume (top 10 by trade frequency)',
      'Prices sourced from Steam Community Market API every ~5 minutes',
      'Stale fallback: last good price held if Steam rate-limits the update',
      'All price changes propagated to the on-chain Solana PriceFeed account',
    ],
  },
  'ak47-index': {
    description: 'Volume-weighted average price index of the 10 most-traded AK-47 skins on the Steam Community Market.',
    basketSize: 10,
    bullets: [
      'Equal-weight average of midpoint prices across 10 AK-47 skin variants',
      'Midpoint = (lowest listing + median sale) / 2 for each constituent',
      'Skins selected by historical Steam market volume',
      'Prices sourced from Steam Community Market API every ~5 minutes',
      'Stale fallback: last good price held if Steam rate-limits the update',
      'All price changes propagated to the on-chain Solana PriceFeed account',
    ],
  },
  'knife-index': {
    description: 'Volume-weighted average price index of the 10 most-traded knife skins on the Steam Community Market.',
    basketSize: 10,
    bullets: [
      'Equal-weight average of midpoint prices across 10 knife variants (Karambit, Butterfly, M9, etc.)',
      'All constituents are Factory New wear — highest rarity tier',
      'Midpoint = (lowest listing + median sale) / 2 for each skin',
      'Prices sourced from Steam Community Market API every ~5 minutes',
      'Stale fallback: last good price held if Steam rate-limits the update',
      'All price changes propagated to the on-chain Solana PriceFeed account',
    ],
  },
  'glove-index': {
    description: 'Volume-weighted average price index of the 10 most-traded glove skins on the Steam Community Market.',
    basketSize: 10,
    bullets: [
      'Equal-weight average of midpoint prices across 10 glove variants (Sport, Driver, Specialist, etc.)',
      'Constituents span Field-Tested and Well-Worn tiers (most liquid for gloves)',
      'Midpoint = (lowest listing + median sale) / 2 for each skin',
      'Prices sourced from Steam Community Market API every ~5 minutes',
      'Stale fallback: last good price held if Steam rate-limits the update',
      'All price changes propagated to the on-chain Solana PriceFeed account',
    ],
  },
};

function fmt(n: number) {
  if (n >= 1000) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(2)}`;
}

function fmtAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

function IndexPanel({ id }: { id: IndexTab }) {
  const price    = useSkinPrice(id);
  const def      = INDEX_DEFINITIONS[id];
  const meta     = INDEX_METHODOLOGY[id];
  const up       = price.changePct24h >= 0;
  const [showAll, setShowAll] = useState(false);

  const shown = showAll
    ? def.constituents
    : def.constituents.slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Oracle status card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div style={{ background: BG, border: `1px solid ${BORDER}` }} className="rounded p-4 space-y-4">
          <div>
            <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest mb-2">Oracle Status</p>
            <div className="flex items-end gap-3">
              <span style={{ color: TEXT }} className="text-[28px] font-mono font-bold tabular-nums leading-none">
                {price.markPrice > 0 ? fmt(price.markPrice) : '—'}
              </span>
              {price.markPrice > 0 && (
                <span className="text-[11px] font-mono font-bold tabular-nums mb-0.5"
                  style={{ color: up ? GREEN : '#ef4444' }}>
                  {up ? '▲' : '▼'} {Math.abs(price.changePct24h).toFixed(2)}%
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {[
              ['Source',    'Steam Community Market'],
              ['Interval',  '~5 minutes'],
              ['Smoothing', 'Adaptive EWMA (α=0.05, ±3% clamp)'],
              ['Last Update', price.lastUpdated ? fmtAge(Date.now() - price.lastUpdated.getTime()) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span style={{ color: DIM }} className="text-[9px] font-mono uppercase tracking-wider">{k}</span>
                <span style={{ color: MUTED }} className="text-[9px] font-mono">{v}</span>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <span style={{ color: DIM }} className="text-[9px] font-mono uppercase tracking-wider">Status</span>
              <span className="flex items-center gap-1 text-[9px] font-mono font-bold" style={{ color: GREEN }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN }} />
                Healthy
              </span>
            </div>
          </div>
        </div>

        <div style={{ background: BG, border: `1px solid ${BORDER}` }} className="rounded p-4">
          <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest mb-3">Session Stats</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['24h High',    price.high24h  > 0 ? fmt(price.high24h)  : '—'],
              ['24h Low',     price.low24h   > 0 ? fmt(price.low24h)   : '—'],
              ['Basket Size', `${meta.basketSize} skins`],
              ['Divisor',     meta.divisor ?? 'Equal weight'],
            ].map(([k, v]) => (
              <div key={k}>
                <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest mb-0.5">{k}</p>
                <p style={{ color: TEXT }} className="text-[11px] font-mono font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Methodology */}
      <div style={{ background: BG, border: `1px solid ${BORDER}` }} className="rounded p-4">
        <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest mb-2">Methodology</p>
        <p style={{ color: MUTED }} className="text-[10px] font-mono leading-relaxed mb-3">{meta.description}</p>
        <ul className="space-y-1.5">
          {meta.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span style={{ color: ORANGE }} className="text-[9px] font-mono shrink-0 mt-0.5">•</span>
              <span style={{ color: DIM }} className="text-[9px] font-mono leading-relaxed">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Constituents */}
      <div style={{ background: BG, border: `1px solid ${BORDER}` }} className="rounded overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: BORDER }}>
          <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest">
            Constituents ({def.constituents.length} skins)
          </p>
          <Link href={`/trade/${id}`} style={{ color: GREEN }} className="text-[9px] font-mono hover:opacity-80 transition-opacity">
            Trade {INDEX_TABS.find(t => t.id === id)?.ticker} →
          </Link>
        </div>
        <div className="divide-y" style={{ borderColor: `${BORDER}80` }}>
          {shown.map((c, i) => (
            <div key={c.hashName} className="px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <span style={{ color: DIM }} className="text-[9px] font-mono tabular-nums w-5 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ color: MUTED }} className="text-[9px] font-mono truncate">{c.hashName}</span>
              </div>
              <span style={{ color: DIM }} className="text-[9px] font-mono tabular-nums shrink-0">
                {(c.staticWeight * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
        {def.constituents.length > 10 && (
          <div className="px-4 py-3 border-t" style={{ borderColor: BORDER }}>
            <button
              onClick={() => setShowAll(s => !s)}
              style={{ color: GREEN }}
              className="text-[9px] font-mono hover:opacity-80 transition-opacity"
            >
              {showAll ? '▲ Show fewer' : `▼ Show all ${def.constituents.length} skins`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IndicesPage() {
  const [activeTab, setActiveTab] = useState<IndexTab>('cs500-index');

  return (
    <main style={{ background: BG, minHeight: '100dvh' }} className="px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 style={{ color: TEXT }} className="text-[13px] font-mono uppercase tracking-[0.08em]">Index Markets</h1>
          <p style={{ color: MUTED }} className="text-[11px] font-mono mt-0.5">
            Methodology, oracle status, and constituents for each index market
          </p>
        </div>

        {/* Index intro */}
        <div style={{ background: `${ORANGE}10`, border: `1px solid ${ORANGE}30` }} className="rounded p-4">
          <p style={{ color: TEXT }} className="text-[10px] font-mono leading-relaxed">
            CS Liquid index markets track baskets of CS2 skins, similar to how the S&P 500 tracks stocks.
            Each index has an on-chain <strong>PriceFeed</strong> account updated every ~5 minutes by the oracle service.
            Perpetual futures settle against these oracle prices — no individual skin price manipulation is possible.
          </p>
        </div>

        {/* Tab bar */}
        <div style={{ background: SURF, border: `1px solid ${BORDER}` }} className="rounded overflow-hidden">
          <div className="flex border-b overflow-x-auto" style={{ borderColor: BORDER }}>
            {INDEX_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 h-10 shrink-0 text-[10px] font-mono uppercase tracking-[0.08em] transition-colors border-b-2"
                style={{
                  color:         activeTab === tab.id ? GREEN : MUTED,
                  borderColor:   activeTab === tab.id ? GREEN : 'transparent',
                  background:    activeTab === tab.id ? `${GREEN}08` : 'transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            <IndexPanel id={activeTab} />
          </div>
        </div>

      </div>
    </main>
  );
}
