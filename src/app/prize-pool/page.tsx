'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const COMPETITION_END = new Date('2026-06-25T00:00:00.000Z');

const BOUNTY_SLOTS = [
  { slot: 1, status: 'OPEN' as const },
  { slot: 2, status: 'OPEN' as const },
  { slot: 3, status: 'OPEN' as const },
  { slot: 4, status: 'OPEN' as const },
];

function getTimeLeft(end: Date) {
  const diff = Math.max(0, end.getTime() - Date.now());
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff / 3_600_000)  % 24),
    minutes: Math.floor((diff / 60_000)     % 60),
    seconds: Math.floor((diff / 1_000)      % 60),
  };
}

function useCountdown(end: Date) {
  const [mounted, setMounted] = useState(false);
  const [time,    setTime]    = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    setMounted(true);
    setTime(getTimeLeft(end));
    const id = setInterval(() => setTime(getTimeLeft(end)), 1000);
    return () => clearInterval(id);
  }, [end]);

  return { ...time, mounted };
}

function CountdownUnit({ value, label, mounted }: { value: number; label: string; mounted: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-14 sm:w-16 h-12 sm:h-14 bg-tx-raised border border-tx-border flex items-center justify-center">
        <span className="font-mono text-xl sm:text-2xl font-bold text-tx-text tabular-nums">
          {mounted ? String(value).padStart(2, '0') : '--'}
        </span>
      </div>
      <span className="text-[9px] font-mono text-tx-dim uppercase tracking-widest">{label}</span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const n = String(rank).padStart(2, '0');
  if (rank === 1) return <span className="font-mono font-bold text-[12px] text-yellow-400 tabular-nums">{n}</span>;
  if (rank === 2) return <span className="font-mono font-bold text-[12px] text-slate-300 tabular-nums">{n}</span>;
  if (rank === 3) return <span className="font-mono font-bold text-[12px] text-orange-400 tabular-nums">{n}</span>;
  return <span className="font-mono text-[11px] text-tx-dim tabular-nums">{n}</span>;
}

export default function PrizePoolPage() {
  const { days, hours, minutes, seconds, mounted } = useCountdown(COMPETITION_END);
  const ended = mounted && days === 0 && hours === 0 && minutes === 0 && seconds === 0;

  return (
    <main className="min-h-screen bg-tx-bg px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Hero */}
        <section className="bg-tx-surface border border-tx-border rounded overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            <div className="p-7 sm:p-10 flex flex-col justify-center space-y-6 order-2 lg:order-1">

              <div>
                <span className="inline-block font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em] border border-tx-green/30 bg-tx-green/10 px-2.5 py-1">
                  Trading Competition
                </span>
              </div>

              <div>
                <h1 className="font-mono text-4xl sm:text-5xl font-black text-tx-text tracking-tight leading-none">
                  PRIZE<br />
                  <span className="text-tx-green">POOL</span>
                </h1>
              </div>

              <div className="space-y-1">
                <span className="inline-block font-mono text-[9px] font-bold text-yellow-400 uppercase tracking-wider border border-yellow-600/30 bg-yellow-500/10 px-2 py-0.5">
                  1st Place Prize
                </span>
                <p className="font-mono text-lg font-bold text-tx-text">AWP | Dragon Lore</p>
                <p className="font-mono text-[11px] text-tx-muted">Factory New · ~$1,200–$1,800 USD</p>
                <p className="text-[11px] font-mono text-tx-dim leading-relaxed pt-1">
                  The most iconic AWP skin in CS2. Win it by accumulating the highest trading volume before the clock hits zero.
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-mono text-[9px] text-tx-dim uppercase tracking-widest">
                  {ended ? 'Competition ended' : 'Competition ends in'}
                </p>
                {ended ? (
                  <p className="font-mono text-xl font-bold text-tx-red">ENDED</p>
                ) : (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <CountdownUnit value={days}    label="Days"  mounted={mounted} />
                    <span className="font-mono text-xl text-tx-dim mb-4">:</span>
                    <CountdownUnit value={hours}   label="Hours" mounted={mounted} />
                    <span className="font-mono text-xl text-tx-dim mb-4">:</span>
                    <CountdownUnit value={minutes} label="Mins"  mounted={mounted} />
                    <span className="font-mono text-xl text-tx-dim mb-4">:</span>
                    <CountdownUnit value={seconds} label="Secs"  mounted={mounted} />
                  </div>
                )}
              </div>

              <Link href="/trade"
                className="inline-flex items-center gap-2 self-start px-5 py-2.5 bg-tx-green text-tx-bg font-mono font-bold text-[11px] uppercase tracking-wider rounded-sm hover:bg-[#00e87a] transition-colors active:scale-[0.98]">
                START TRADING
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>

            {/* Skin image placeholder */}
            <div className="order-1 lg:order-2 h-56 sm:h-72 lg:h-auto border-b lg:border-b-0 lg:border-l border-tx-border relative overflow-hidden bg-tx-raised flex items-center justify-center">
              <div className="text-center space-y-1.5 py-8">
                <p className="font-mono text-[10px] text-tx-dim uppercase tracking-widest">AWP</p>
                <p className="font-mono text-2xl font-black text-tx-text">Dragon Lore</p>
                <p className="font-mono text-[10px] text-tx-dim">Factory New</p>
                <p className="font-mono text-[10px] text-tx-dim mt-3">~$1,200 – $1,800 USD</p>
              </div>
            </div>
          </div>
        </section>

        {/* How to Win */}
        <section className="space-y-4">
          <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">How To Win</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">
            {[
              { n: '01', title: 'Trade any market', body: 'Open long or short positions on any CS skin perpetual market. All markets count toward your volume.' },
              { n: '02', title: 'Accumulate volume',  body: 'Every position you open adds to your total volume. Highest cumulative volume by the deadline wins.' },
              { n: '03', title: 'Win the prize skin', body: 'The #1 volume trader when the clock hits zero wins the featured skin, claimable by submitting your Steam trade link.' },
            ].map(({ n, title, body }) => (
              <div key={n} className="bg-tx-surface p-5 space-y-3 relative overflow-hidden">
                <div className="absolute -right-3 -top-3 font-mono text-5xl font-black text-tx-raised select-none leading-none">
                  {n}
                </div>
                <span className="font-mono text-[10px] font-bold text-tx-green">{n}</span>
                <p className="font-mono text-[11px] font-semibold text-tx-text">{title}</p>
                <p className="text-[11px] font-mono text-tx-dim leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <div className="bg-tx-surface border border-tx-border rounded-sm px-5 py-3 text-[10px] font-mono text-tx-dim leading-relaxed">
            <span className="text-tx-muted font-semibold">Rules: </span>
            Volume is calculated from the notional value of each position opened. Only positions opened during the competition period count. One winner. No wash trading — suspicious activity will be disqualified.
          </div>
        </section>

        {/* Bonus USDC Bounty */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">Bonus USDC Bounty</h2>
            <span className="font-mono text-[10px] text-tx-dim">0 of 4 claimed</span>
          </div>

          <div className="bg-tx-surface border border-tx-border rounded p-5 space-y-4">
            <p className="text-[11px] font-mono text-tx-muted leading-relaxed">
              The first <span className="text-tx-text font-bold">4 traders</span> to close a position with realized PnL &gt;{' '}
              <span className="text-tx-green font-bold">$5.00</span> each win{' '}
              <span className="text-tx-green font-bold">$25 USDC</span> sent directly to their wallet.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BOUNTY_SLOTS.map(({ slot }) => (
                <div key={slot} className="border p-3 space-y-2 bg-tx-bg border-tx-border border-dashed">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-tx-dim uppercase tracking-wider">Slot #{slot}</span>
                    <span className="font-mono text-[9px] text-tx-dim">OPEN</span>
                  </div>
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] text-tx-dim">—</p>
                    <p className="font-mono text-[9px] text-tx-dim">Waiting…</p>
                    <div className="h-3 w-full bg-tx-raised animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Volume Leaderboard */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">Volume Leaderboard</h2>
            <span className="font-mono text-[10px] text-tx-dim">Updated live</span>
          </div>

          <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
            <div className="grid grid-cols-[36px_1fr_80px_72px] md:grid-cols-[44px_1fr_100px_68px_56px_88px] gap-x-2 px-4 py-2.5 border-b border-tx-border">
              <span className="font-mono text-[9px] text-tx-dim uppercase tracking-wider">RANK</span>
              <span className="font-mono text-[9px] text-tx-dim uppercase tracking-wider">WALLET</span>
              <span className="font-mono text-[9px] text-tx-dim uppercase tracking-wider">VOLUME</span>
              <span className="font-mono text-[9px] text-tx-dim uppercase tracking-wider md:hidden">PNL</span>
              <span className="hidden md:block font-mono text-[9px] text-tx-dim uppercase tracking-wider">WIN %</span>
              <span className="hidden md:block font-mono text-[9px] text-tx-dim uppercase tracking-wider">TRADES</span>
              <span className="hidden md:block font-mono text-[9px] text-tx-dim uppercase tracking-wider">PNL</span>
            </div>

            <div className="px-4 py-10 text-center text-[11px] font-mono text-tx-dim uppercase tracking-wider">
              No trading data yet — start trading to appear here
            </div>

            <div className="px-4 py-2.5 border-t border-tx-border flex items-center justify-between">
              <span className="font-mono text-[9px] text-tx-dim">
                Ends {COMPETITION_END.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <Link href="/trade"
                className="font-mono text-[10px] text-tx-green hover:text-[#00e87a] transition-colors uppercase tracking-wider">
                Trade now →
              </Link>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
