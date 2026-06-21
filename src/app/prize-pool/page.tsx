'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

const COMPETITION_END = new Date('2026-07-15T00:00:00.000Z');

// Competition prize
const PRIZE = {
  name:     'AWP | Dragon Lore (Factory New)',
  value:    '$10,000+',
  image:    '/skins/awp-dragon-lore.png',
  shortName:'Dragon Lore FN',
};

// Past winner (shown after competition ends)
const PAST_WINNER = {
  wallet:   '',  // populated when a winner is known
  username: '',
  volume:   0,
  prize:    '',
};

interface LeaderboardEntry {
  wallet:    string;
  totalPnl:  number;
  winRate:   number;
  trades:    number;
  volume:    number;
  username?: string | null;
}

function fmtVol(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function shortWallet(w: string) {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

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

function VolumeBar({ volume, maxVolume, rank }: { volume: number; maxVolume: number; rank: number }) {
  const pct = maxVolume > 0 ? (volume / maxVolume) * 100 : 0;
  const colors = ['#facc15', '#94a3b8', '#f97316'];
  const color  = colors[rank - 1] ?? '#374151';
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-tx-raised rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-700"
          style={{ width: `${pct.toFixed(1)}%`, background: color }}
        />
      </div>
      <span className="text-[9px] font-mono tabular-nums shrink-0" style={{ color }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export default function PrizePoolPage() {
  const { user } = useAuth();
  const wallet   = user && 'address' in user ? (user as { address: string }).address : null;

  const { days, hours, minutes, seconds, mounted } = useCountdown(COMPETITION_END);
  const ended = mounted && days === 0 && hours === 0 && minutes === 0 && seconds === 0;

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading,   setLbLoading]   = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data: LeaderboardEntry[] = await res.json();
        setLeaderboard(data.sort((a, b) => b.volume - a.volume));
      }
    } catch {}
    setLbLoading(false);
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    const id = setInterval(fetchLeaderboard, 30_000);
    return () => clearInterval(id);
  }, [fetchLeaderboard]);

  const userEntry  = wallet ? leaderboard.find(e => e.wallet === wallet) : null;
  const userRank   = userEntry ? leaderboard.indexOf(userEntry) + 1 : null;
  const maxVolume  = leaderboard[0]?.volume ?? 0;
  const top3       = leaderboard.slice(0, 3);

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
                  PRIZE<br /><span className="text-tx-green">POOL</span>
                </h1>
              </div>

              <div className="space-y-1">
                <span className="inline-block font-mono text-[9px] font-bold text-yellow-400 uppercase tracking-wider border border-yellow-600/30 bg-yellow-500/10 px-2 py-0.5">
                  1st Place Prize
                </span>
                <p className="font-mono text-lg font-bold text-tx-text">{PRIZE.name}</p>
                <p className="font-mono text-[11px] text-tx-muted">{PRIZE.value}</p>
                <p className="text-[11px] font-mono text-tx-dim leading-relaxed pt-1">
                  The rarest AWP in CS2. Win it by accumulating the highest trading volume before the clock hits zero.
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

            {/* Skin visual */}
            <div className="order-1 lg:order-2 h-64 sm:h-80 lg:h-auto min-h-[280px] border-b lg:border-b-0 lg:border-l border-tx-border bg-tx-raised flex flex-col items-center justify-center p-6 gap-3">
              <div className="w-48 h-48 bg-tx-surface border border-tx-border rounded flex items-center justify-center">
                <span className="text-[10px] font-mono text-tx-dim text-center px-4">AWP | Dragon Lore<br />(Factory New)</span>
              </div>
              <span className="text-[9px] font-mono text-tx-dim uppercase tracking-wider">Skin awarded to winner</span>
            </div>
          </div>
        </section>

        {/* Live Top 3 with volume bars */}
        <section className="space-y-3">
          <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">Live Race</h2>
          {lbLoading ? (
            <div className="bg-tx-surface border border-tx-border rounded p-6 text-center text-[11px] font-mono text-tx-dim">Loading…</div>
          ) : top3.length === 0 ? (
            <div className="bg-tx-surface border border-tx-border rounded p-6 text-center text-[11px] font-mono text-tx-dim">
              No trading data yet — be the first to trade and take the lead!
            </div>
          ) : (
            <div className="bg-tx-surface border border-tx-border rounded overflow-hidden divide-y divide-tx-border">
              {top3.map((e, i) => {
                const rank = i + 1;
                return (
                  <div key={e.wallet} className={`px-5 py-4 space-y-2 ${rank === 1 ? 'bg-yellow-500/5' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <RankBadge rank={rank} />
                        <span className="font-mono text-[11px] text-tx-muted">
                          {e.username ? `@${e.username}` : shortWallet(e.wallet)}
                        </span>
                      </div>
                      <span className="font-mono text-[13px] font-bold text-tx-text tabular-nums">
                        {fmtVol(e.volume)}
                      </span>
                    </div>
                    <VolumeBar volume={e.volume} maxVolume={maxVolume} rank={rank} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Your Rank */}
        {wallet && (
          <section>
            <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em] mb-3">Your Position</h2>
            <div className="bg-tx-surface border border-tx-border rounded p-5">
              {userEntry && userRank ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-tx-raised border border-tx-border rounded flex items-center justify-center">
                      <span className="font-mono text-[14px] font-bold text-tx-green">#{userRank}</span>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono text-tx-muted">{shortWallet(userEntry.wallet)}</p>
                      <p className="text-[10px] font-mono text-tx-dim mt-0.5">{userEntry.trades} trade{userEntry.trades !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[16px] font-bold text-tx-text tabular-nums">{fmtVol(userEntry.volume)}</p>
                    <p className="text-[10px] font-mono text-tx-dim mt-0.5">total volume</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-tx-raised border border-tx-border border-dashed rounded flex items-center justify-center">
                    <span className="font-mono text-[14px] text-tx-dim">—</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-mono text-tx-muted">Not yet ranked</p>
                    <Link href="/trade" className="text-[10px] font-mono text-tx-green hover:opacity-80 transition-opacity mt-0.5 block">
                      Make your first trade to enter →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Past Winner (shown when competition has ended and a winner is known) */}
        {ended && PAST_WINNER.wallet && (
          <section>
            <h2 className="font-mono text-[10px] font-bold text-orange-400 uppercase tracking-[0.15em] mb-3">Competition Winner</h2>
            <div className="bg-tx-surface border border-orange-500/40 rounded overflow-hidden">
              <div className="bg-orange-500/10 px-5 py-2 border-b border-orange-500/30">
                <span className="font-mono text-[10px] font-bold text-orange-400 uppercase tracking-wider">🏆 Competition Winner</span>
              </div>
              <div className="p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[13px] font-bold text-tx-text">
                    {PAST_WINNER.username ? `@${PAST_WINNER.username}` : shortWallet(PAST_WINNER.wallet)}
                  </p>
                  <p className="font-mono text-[10px] text-tx-muted mt-0.5">{shortWallet(PAST_WINNER.wallet)}</p>
                  <p className="font-mono text-[10px] text-tx-dim mt-1">Volume: {fmtVol(PAST_WINNER.volume)}</p>
                  <p className="font-mono text-[10px] text-orange-400 mt-1">Wins: {PAST_WINNER.prize}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* How to Win */}
        <section className="space-y-4">
          <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">How To Win</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">
            {[
              { n: '01', title: 'Trade any market', body: 'Open long or short positions on any CS skin perpetual market. All markets count toward your volume.' },
              { n: '02', title: 'Accumulate volume', body: 'Every $1 of notional position size = 1 competition point. Highest cumulative volume wins.' },
              { n: '03', title: 'Win the prize skin', body: 'The #1 volume trader when the clock hits zero wins the featured skin, delivered via Steam trade.' },
            ].map(({ n, title, body }) => (
              <div key={n} className="bg-tx-surface p-5 space-y-3 relative overflow-hidden">
                <div className="absolute -right-3 -top-3 font-mono text-5xl font-black text-tx-raised select-none leading-none">{n}</div>
                <span className="font-mono text-[10px] font-bold text-tx-green">{n}</span>
                <p className="font-mono text-[11px] font-semibold text-tx-text">{title}</p>
                <p className="text-[11px] font-mono text-tx-dim leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <div className="bg-tx-surface border border-tx-border rounded-sm px-5 py-3 text-[10px] font-mono text-tx-dim leading-relaxed">
            <span className="text-tx-muted font-semibold">Rules: </span>
            Volume calculated from notional value of each position opened during the competition period. One winner. No wash trading — suspicious activity will be disqualified.
          </div>
        </section>

        {/* Full Leaderboard */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">Full Leaderboard</h2>
            <span className="font-mono text-[10px] text-tx-dim">Updates every 30s</span>
          </div>

          <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
            <div className="grid grid-cols-[36px_1fr_80px_72px] md:grid-cols-[44px_1fr_100px_68px_56px_88px] gap-x-2 px-4 py-2.5 border-b border-tx-border">
              {['RANK', 'WALLET', 'VOLUME', 'PNL', 'WIN %', 'TRADES'].map((h, i) => (
                <span key={h} className={`font-mono text-[9px] text-tx-dim uppercase tracking-wider ${i >= 4 ? 'hidden md:block' : i === 3 ? 'md:hidden' : ''}`}>{h}</span>
              ))}
              <span className="hidden md:block font-mono text-[9px] text-tx-dim uppercase tracking-wider">PNL</span>
            </div>

            {lbLoading ? (
              <div className="px-4 py-10 text-center text-[11px] font-mono text-tx-dim">Loading…</div>
            ) : leaderboard.length === 0 ? (
              <div className="px-4 py-10 text-center text-[11px] font-mono text-tx-dim">
                No trading data yet — start trading to appear here
              </div>
            ) : leaderboard.map((entry, i) => {
              const rank = i + 1;
              const pnlPos = entry.totalPnl >= 0;
              const isUser = entry.wallet === wallet;
              return (
                <div key={entry.wallet}
                  className={`grid grid-cols-[36px_1fr_80px_72px] md:grid-cols-[44px_1fr_100px_68px_56px_88px] gap-x-2 px-4 py-2.5 border-b border-tx-border/50 last:border-0 transition-colors ${
                    rank === 1 ? 'bg-yellow-500/5' : isUser ? 'bg-tx-green/5' : 'hover:bg-tx-raised'
                  }`}>
                  <span className="flex items-center"><RankBadge rank={rank} /></span>
                  <span className="flex items-center font-mono text-[11px] text-tx-muted">
                    {entry.username ? `@${entry.username}` : shortWallet(entry.wallet)}
                    {isUser && <span className="ml-1.5 text-[8px] font-bold text-tx-green border border-tx-green/30 px-1 py-0.5 rounded-sm">YOU</span>}
                  </span>
                  <span className="flex items-center font-mono text-[11px] font-bold text-tx-text tabular-nums">{fmtVol(entry.volume)}</span>
                  <span className={`flex items-center font-mono text-[11px] tabular-nums md:hidden ${pnlPos ? 'text-tx-green' : 'text-tx-red'}`}>{pnlPos ? '+' : ''}{fmtVol(entry.totalPnl)}</span>
                  <span className="hidden md:flex items-center font-mono text-[11px] text-tx-muted tabular-nums">{entry.winRate.toFixed(0)}%</span>
                  <span className="hidden md:flex items-center font-mono text-[11px] text-tx-dim tabular-nums">{entry.trades}</span>
                  <span className={`hidden md:flex items-center font-mono text-[11px] tabular-nums ${pnlPos ? 'text-tx-green' : 'text-tx-red'}`}>{pnlPos ? '+' : ''}{fmtVol(entry.totalPnl)}</span>
                </div>
              );
            })}

            <div className="px-4 py-2.5 border-t border-tx-border flex items-center justify-between">
              <span className="font-mono text-[9px] text-tx-dim">
                Ends {COMPETITION_END.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <Link href="/trade" className="font-mono text-[10px] text-tx-green hover:text-[#00e87a] transition-colors uppercase tracking-wider">
                Trade now →
              </Link>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
