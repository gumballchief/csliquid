'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/layout/Logo';
import { useSkinPrice } from '@/hooks/useSkinPrice';

// ── Hero index cards ───────────────────────────────────────────────────────────
const HERO_INDEX_CARDS = [
  { id: 'awp-index',   label: 'AWP Index',   skin: 'AWP | Dragon Lore',            url: '/skins/awp-index.png'   },
  { id: 'knife-index', label: 'Knife Index', skin: 'Karambit | Fade',              url: '/skins/knife-index.png' },
  { id: 'ak47-index',  label: 'AK-47 Index', skin: 'AK-47 | Wild Lotus',          url: '/skins/ak47-index.png'  },
  { id: 'glove-index', label: 'Glove Index', skin: 'Sport Gloves | Crimson Weave', url: '/skins/glove-index.png' },
];

// ── Market metadata ────────────────────────────────────────────────────────────
const MARKET_META = [
  { id: 'awp-index',   weapon: 'AWP',   name: 'AWP Index'   },
  { id: 'ak47-index',  weapon: 'AK-47', name: 'AK-47 Index' },
  { id: 'knife-index', weapon: 'KNIFE', name: 'Knife Index' },
  { id: 'glove-index', weapon: 'GLOVE', name: 'Glove Index' },
] as const;

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmtPrice(p: number) {
  if (!p || p <= 0) return '—';
  if (p >= 1000) return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return '$' + p.toFixed(2);
}
function fmtPct(pct: number, loading: boolean) {
  if (loading) return '—';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}
function fmtLargeUSD(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

type StepTab = 'All' | 'Rifles' | 'Knives' | 'Pistols';

interface PoolStats {
  initialized: boolean;
  totalUsdc: number;
  feesEarned: number;
  apr7d: number;
  sharePrice: number;
}

type LiveMarket = {
  id: string;
  weapon: string;
  name: string;
  priceStr: string;
  pctStr: string;
  pos: boolean;
};

// ── Landing page ───────────────────────────────────────────────────────────────
export default function LandingPage() {
  const awp   = useSkinPrice('awp-index');
  const ak47  = useSkinPrice('ak47-index');
  const knife = useSkinPrice('knife-index');
  const glove = useSkinPrice('glove-index');

  const skinData: Record<string, ReturnType<typeof useSkinPrice>> = {
    'awp-index': awp, 'ak47-index': ak47, 'knife-index': knife, 'glove-index': glove,
  };

  const [pool, setPool] = useState<PoolStats | null>(null);

  useEffect(() => {
    fetch('/api/pool/stats').then(r => r.json()).then(setPool).catch(() => {});
  }, []);

  // Derive live market rows for PickSkinDemo
  const liveMarkets: LiveMarket[] = MARKET_META.map(m => {
    const d = skinData[m.id];
    return {
      id: m.id, weapon: m.weapon, name: m.name,
      priceStr: fmtPrice(d.markPrice),
      pctStr: fmtPct(d.changePct24h, d.loading),
      pos: d.changePct24h >= 0,
    };
  });

  // Total platform volume = fees / 0.05% taker rate
  const platformVolume = pool?.initialized ? pool.feesEarned / 0.0005 : null;

  // Entrance animation — triggers one frame after mount so CSS transition fires
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const fadeUp = (delay: number): React.CSSProperties => ({
    opacity:    entered ? 1 : 0,
    transform:  entered ? 'translateY(0px)' : 'translateY(28px)',
    transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
  });

  return (
    <main className="min-h-screen bg-tx-bg overflow-x-hidden">

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section style={{ background: '#0a0b0d', width: '100%' }}>

        {/* Logo + tagline + description */}
        <div style={{ textAlign: 'center', padding: '88px 16px 40px' }}>
          <div style={{ marginBottom: 20, ...fadeUp(0) }}>
            <Logo size={64} />
          </div>

          <p style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: '#6b7280',
            margin: '0 0 20px',
            ...fadeUp(80),
          }}>
            CS2 Skin Perpetual Futures on Solana
          </p>

          {/* Description */}
          <p style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 13, color: '#6b7280',
            lineHeight: 1.7, maxWidth: 600, margin: '0 auto',
            ...fadeUp(160),
          }}>
            Trade CS2 skin price movements without owning the skins. Go long if you think the AWP
            Dragon Lore pumps. Go short if you think Karambit prices drop. Set your USDC collateral,
            choose up to 20x leverage, and manage risk with stop loss and take profit — all on Solana.
          </p>
        </div>

        {/* 4 index skin cards — 2×2 on mobile, 4-across on md+ */}
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-6 pb-8 max-w-2xl md:max-w-3xl lg:max-w-none mx-auto"
          style={fadeUp(260)}
        >
          {HERO_INDEX_CARDS.map((card, i) => {
            const d = skinData[card.id];
            const pos = d.changePct24h >= 0;
            return (
              <Link key={card.id} href="/trade" style={{ textDecoration: 'none' }}>
                <div style={{
                  background: '#111214', border: '1px solid #1e2025', borderRadius: 4,
                  padding: 12, cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#FF6B00')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2025')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.url}
                    alt={card.skin}
                    width={120}
                    height={120}
                    style={{
                      display: 'block', width: '100%', height: 'auto',
                      aspectRatio: '1/1', objectFit: 'contain', borderRadius: 2,
                    }}
                  />
                  <p style={{
                    margin: '8px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {card.label}
                  </p>
                  <p style={{
                    margin: '3px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 12,
                    color: '#e8eaed',
                  }}>
                    {d.loading ? '—' : fmtPrice(d.markPrice)}
                  </p>
                  <p style={{
                    margin: '2px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 10,
                    fontWeight: 700, color: pos ? '#00ff88' : '#ff4444',
                  }}>
                    {fmtPct(d.changePct24h, d.loading)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

      </section>

      {/* ── LIVE MARKET DATA ──────────────────────────────────────────────────── */}
      <section className="border-b border-tx-border">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-2">

          {/* 4 live market price cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden">
            {MARKET_META.map(m => {
              const d = skinData[m.id];
              const pos = d.changePct24h >= 0;
              return (
                <Link key={m.id} href={`/trade/${m.id}`}
                  className="bg-tx-surface px-4 py-3 hover:bg-tx-raised transition-colors group">
                  <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">{m.name}</p>
                  <p className="text-[20px] font-mono font-bold text-tx-text tabular-nums mt-1 group-hover:text-white transition-colors">
                    {d.loading
                      ? <span className="text-[14px] text-tx-dim animate-pulse">loading…</span>
                      : fmtPrice(d.markPrice)
                    }
                  </p>
                  <p className={`text-[11px] font-mono font-bold tabular-nums mt-0.5 ${pos ? 'text-tx-green' : 'text-tx-red'}`}>
                    {fmtPct(d.changePct24h, d.loading)}
                    {!d.loading && (
                      <span className="ml-1.5 text-[9px] font-normal text-tx-dim uppercase tracking-wider">24H</span>
                    )}
                  </p>
                  <p className="text-[9px] font-mono text-tx-dim mt-1.5 uppercase tracking-wider">
                    {d.source === 'live' ? '● LIVE' : d.source === 'cached' ? '◌ CACHED' : '— MOCK'}
                  </p>
                </Link>
              );
            })}
          </div>

          {/* Protocol stats row — from on-chain pool */}
          <div className="grid grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">
            <PoolStat
              label="Pool TVL"
              value={pool === null ? '…' : pool.initialized ? fmtLargeUSD(pool.totalUsdc) + ' USDC' : '—'}
              sub="liquidity pool"
            />
            <PoolStat
              label="Total Volume"
              value={platformVolume !== null ? fmtLargeUSD(platformVolume) : pool === null ? '…' : '—'}
              sub="since inception"
            />
            <PoolStat
              label="Pool APR"
              value={pool === null ? '…' : pool.initialized && pool.apr7d > 0 ? pool.apr7d.toFixed(1) + '%' : '—'}
              sub="annualised"
              highlight={pool?.initialized && pool.apr7d > 0}
            />
          </div>
        </div>
      </section>

      {/* ── 3 STEPS ───────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-tx-dim mb-2">
            How it works
          </p>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-tx-text tracking-tight">
            TRADE CS SKIN PERPS IN 3 STEPS
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">
          <StepWrapper step="01" title="Pick Skin" subtitle="Browse all available skin futures">
            <PickSkinDemo markets={liveMarkets} />
          </StepWrapper>

          <StepWrapper step="02" title="Long / Short" subtitle="Set direction, leverage, and collateral">
            <TradeDemo entryPrice={awp.loading ? 95.40 : awp.markPrice} />
          </StepWrapper>

          <StepWrapper step="03" title="Manage PNL" subtitle="Monitor live and close anytime">
            <PnlDemo entryPrice={awp.loading ? 91.00 : awp.markPrice * 0.953} markPrice={awp.loading ? 95.40 : awp.markPrice} />
          </StepWrapper>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col sm:flex-row items-center justify-center gap-3 px-4 pb-20">
        <Link
          href="/login"
          className="px-10 py-3 bg-tx-green text-tx-bg font-mono font-bold text-[12px] uppercase tracking-[0.08em] rounded-sm hover:bg-[#00e87a] active:scale-[0.98] transition-all min-w-[180px] text-center"
        >
          Start Trading
        </Link>
        <Link
          href="/login"
          className="px-10 py-3 border border-tx-border text-tx-muted font-mono text-[12px] uppercase tracking-[0.08em] rounded-sm hover:border-tx-border2 hover:text-tx-text transition-all min-w-[180px] text-center"
        >
          Connect Wallet
        </Link>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-tx-border py-6 px-4 text-center space-y-2">
        <p className="text-[10px] font-mono text-tx-dim max-w-lg mx-auto leading-relaxed">
          Experimental software. Not financial advice. Not available to US persons. Use at your own risk.
        </p>
        <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-tx-dim">
          <Link href="#" className="hover:text-tx-muted transition-colors uppercase tracking-wider">Terms</Link>
          <span className="text-tx-border">|</span>
          <Link href="#" className="hover:text-tx-muted transition-colors uppercase tracking-wider">Privacy</Link>
        </div>
      </footer>
    </main>
  );
}

// ── Pool stat cell ──────────────────────────────────────────────────────────────
function PoolStat({
  label, value, sub, highlight,
}: { label: string; value: string; sub: string; highlight?: boolean | null }) {
  return (
    <div className="bg-tx-surface px-4 py-3">
      <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">{label}</p>
      <p className={`text-[14px] font-mono font-bold tabular-nums mt-0.5 ${highlight ? 'text-tx-green' : 'text-tx-text'}`}>
        {value}
      </p>
      <p className="text-[9px] font-mono text-tx-dim mt-0.5">{sub}</p>
    </div>
  );
}

// ── Shared step wrapper ─────────────────────────────────────────────────────────
function StepWrapper({
  step, title, subtitle, children,
}: {
  step: string; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-tx-surface flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-tx-border flex items-start gap-3">
        <span className="text-[28px] font-mono font-bold text-tx-dim leading-none shrink-0 select-none tabular-nums">
          {step}
        </span>
        <div>
          <h3 className="text-[12px] font-mono uppercase tracking-[0.06em] text-tx-text">{title}</h3>
          <p className="text-[10px] font-mono text-tx-dim mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex-1 p-4 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ── Step 1: Pick Skin — real live prices ────────────────────────────────────────
const STEP_TABS: StepTab[] = ['All', 'Rifles', 'Knives', 'Pistols'];
const TAB_FILTER: Record<StepTab, string | null> = {
  All: null, Rifles: 'AWP', Knives: 'KNIFE', Pistols: null,
};

function PickSkinDemo({ markets }: { markets: LiveMarket[] }) {
  const [tab, setTab] = useState<StepTab>('All');
  const [search, setSearch] = useState('');

  const visible = markets.filter(m => {
    const weapon = TAB_FILTER[tab];
    if (weapon && m.weapon !== weapon) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const shown = visible.length > 0 ? visible : markets;

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-tx-dim pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skins…"
          className="w-full bg-tx-bg border border-tx-border rounded-sm pl-7 pr-3 py-1.5 text-[11px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-px bg-tx-border rounded-sm overflow-hidden">
        {STEP_TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
              tab === t ? 'bg-tx-raised text-tx-green' : 'bg-tx-bg text-tx-dim hover:text-tx-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Market grid — real prices */}
      <div className="grid grid-cols-2 gap-px bg-tx-border rounded-sm overflow-hidden">
        {shown.map(m => (
          <Link
            key={m.id}
            href={`/trade/${m.id}`}
            className="bg-tx-bg hover:bg-tx-raised p-2.5 transition-colors"
          >
            <p className="text-[10px] font-mono uppercase tracking-wider text-tx-dim mb-1">{m.weapon}</p>
            <p className="text-[11px] font-mono text-tx-text truncate">{m.name}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] font-mono tabular-nums text-tx-muted">{m.priceStr}</span>
              <span className={`text-[10px] font-mono font-bold tabular-nums ${m.pos ? 'text-tx-green' : 'text-tx-red'}`}>
                {m.pctStr}
              </span>
            </div>
          </Link>
        ))}
        {visible.length === 0 && (
          <div className="col-span-2 py-6 text-center">
            <p className="text-[10px] font-mono text-tx-dim uppercase tracking-wider">No markets match</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Trade ticket demo ───────────────────────────────────────────────────
const LEVERAGES = [1, 2, 5, 10, 20] as const;

function TradeDemo({ entryPrice }: { entryPrice: number }) {
  const [side, setSide]         = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState(5);
  const [collateral, setCollateral] = useState('');
  const isLong = side === 'long';

  const col      = parseFloat(collateral) || 0;
  const notional = col * leverage;
  const size     = col > 0 ? notional / entryPrice : 0;
  const fee      = notional * 0.0005;
  const liqPrice = isLong ? (entryPrice * (1 - 0.9 / leverage)) : (entryPrice * (1 + 0.9 / leverage));

  return (
    <div className="space-y-3">
      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-px bg-tx-border rounded-sm overflow-hidden">
        <button
          onClick={() => setSide('long')}
          className={`py-2 text-[11px] font-mono uppercase tracking-wider font-bold transition-all ${isLong ? 'bg-tx-green text-tx-bg' : 'bg-tx-bg text-tx-dim hover:text-tx-muted'}`}
        >
          Long
        </button>
        <button
          onClick={() => setSide('short')}
          className={`py-2 text-[11px] font-mono uppercase tracking-wider font-bold transition-all ${!isLong ? 'bg-tx-red text-white' : 'bg-tx-bg text-tx-dim hover:text-tx-muted'}`}
        >
          Short
        </button>
      </div>

      {/* Leverage */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-tx-dim">Leverage</span>
          <span className="text-[10px] font-mono font-bold text-tx-green tabular-nums">{leverage}×</span>
        </div>
        <div className="flex gap-px bg-tx-border rounded-sm overflow-hidden">
          {LEVERAGES.map(l => (
            <button
              key={l}
              onClick={() => setLeverage(l)}
              className={`flex-1 py-1.5 text-[10px] font-mono tabular-nums transition-colors ${
                leverage === l ? 'bg-tx-raised text-tx-green' : 'bg-tx-bg text-tx-dim hover:text-tx-muted'
              }`}
            >
              {l}×
            </button>
          ))}
        </div>
      </div>

      {/* Collateral */}
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-tx-dim block mb-1.5">Collateral</span>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-tx-dim">$</span>
          <input
            type="number"
            value={collateral}
            onChange={e => setCollateral(e.target.value)}
            placeholder="0.00"
            className="w-full bg-tx-bg border border-tx-border rounded-sm pl-6 pr-12 py-2 text-[11px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono uppercase text-tx-dim">USDC</span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-tx-bg border border-tx-border rounded-sm p-3 space-y-1.5">
        <DemoRow label="Est. Entry"      value={fmtPrice(entryPrice)} />
        <DemoRow label="Position Size"   value={col > 0 ? `${size.toFixed(4)} units` : '—'} />
        <DemoRow label="Fee (0.05%)"     value={col > 0 ? `$${fee.toFixed(4)}` : '—'} dim />
        <div className="border-t border-tx-border pt-1.5">
          <DemoRow
            label="Liq. Price"
            value={col > 0 ? fmtPrice(liqPrice) : '—'}
            valueClass={isLong ? 'text-tx-red' : 'text-tx-green'}
          />
        </div>
      </div>

      <button
        className={`w-full py-2.5 rounded-sm text-[11px] font-mono uppercase tracking-wider font-bold transition-colors ${
          isLong ? 'bg-tx-green text-tx-bg hover:bg-[#00e87a]' : 'bg-tx-red text-white hover:bg-[#e83c3c]'
        }`}
      >
        Review Trade
      </button>
    </div>
  );
}

// ── Step 3: PNL demo ────────────────────────────────────────────────────────────
const PNL_SERIES = [0, 3, 1, 6, 4, 9, 7, 13, 11, 16, 18, 22, 20, 25, 28, 26, 31, 35, 33, 38, 44];

function PnlDemo({ entryPrice, markPrice }: { entryPrice: number; markPrice: number }) {
  const W = 280, H = 56;
  const min = Math.min(...PNL_SERIES);
  const max = Math.max(...PNL_SERIES);
  const range = max - min || 1;
  const pts = PNL_SERIES.map((v, i) => {
    const x = (i / (PNL_SERIES.length - 1)) * W;
    const y = H - ((v - min) / range) * H * 0.85 - H * 0.05;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const size = 10;
  const pnl  = (markPrice - entryPrice) * size;
  const pct  = entryPrice > 0 ? ((markPrice - entryPrice) / entryPrice) * 100 * 5 : 0; // 5× leverage
  const pup  = pnl >= 0;
  const liq  = entryPrice * (1 - 0.9 / 5);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-tx-text">AWP-INDEX-PERP</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] font-mono uppercase tracking-wider bg-tx-green/10 text-tx-green border border-tx-green/20 px-1.5 py-0.5">LONG</span>
            <span className="text-[10px] font-mono text-tx-dim">5× · {size} units</span>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-[18px] font-mono font-bold tabular-nums leading-none ${pup ? 'text-tx-green' : 'text-tx-red'}`}>
            {pup ? '+' : ''}{fmtPrice(Math.abs(pnl)).replace('$', pup ? '+$' : '-$')}
          </p>
          <p className={`text-[10px] font-mono tabular-nums mt-0.5 ${pup ? 'text-tx-green' : 'text-tx-red'}`}>
            {pup ? '+' : ''}{pct.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="bg-tx-bg border border-tx-border rounded-sm overflow-hidden px-1 pt-2 pb-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 56 }} preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="space-y-1.5">
        <DemoRow label="Entry Price"    value={fmtPrice(entryPrice)} />
        <DemoRow label="Mark Price"     value={fmtPrice(markPrice)} valueClass="text-tx-text" />
        <DemoRow label="Unrealized PNL" value={`${pup ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`} valueClass={`${pup ? 'text-tx-green' : 'text-tx-red'} font-bold`} />
        <DemoRow label="Liq. Price"     value={fmtPrice(liq)} valueClass="text-tx-red" />
      </div>

      <button className="w-full py-2.5 rounded-sm text-[11px] font-mono uppercase tracking-wider font-bold border border-tx-red text-tx-red hover:bg-tx-red hover:text-white transition-colors">
        Close Position
      </button>
    </div>
  );
}

// ── Shared row helper ───────────────────────────────────────────────────────────
function DemoRow({ label, value, valueClass, dim }: {
  label: string; value: string; valueClass?: string; dim?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono uppercase tracking-wider text-tx-dim">{label}</span>
      <span className={`text-[11px] font-mono tabular-nums ${valueClass ?? (dim ? 'text-tx-dim' : 'text-tx-muted')}`}>{value}</span>
    </div>
  );
}
