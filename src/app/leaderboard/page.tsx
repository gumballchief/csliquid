'use client';

import { useState, useEffect, useCallback } from 'react';

type Tab = 'pnl' | 'volume';

interface TraderStats {
  wallet:       string;
  totalPnl:     number;
  trades:       number;
  volume:       number;
  winRate:      number;
}

function RankCell({ rank }: { rank: number }) {
  const n = String(rank).padStart(2, '0');
  if (rank === 1) return <span className="font-mono font-bold text-[12px] text-yellow-400 tabular-nums">{n}</span>;
  if (rank === 2) return <span className="font-mono font-bold text-[12px] text-slate-300 tabular-nums">{n}</span>;
  if (rank === 3) return <span className="font-mono font-bold text-[12px] text-orange-400 tabular-nums">{n}</span>;
  return <span className="font-mono text-[11px] text-tx-dim tabular-nums">{n}</span>;
}

function truncate(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function fmtUSD(n: number, decimals = 2) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(decimals)}`;
}

export default function LeaderboardPage() {
  const [tab,     setTab]     = useState<Tab>('pnl');
  const [traders, setTraders] = useState<TraderStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(() => {
    setLoading(true);
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then((data: TraderStats[]) => {
        setTraders(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    const timer = setInterval(fetchLeaderboard, 30_000);
    return () => clearInterval(timer);
  }, [fetchLeaderboard]);

  const sorted = [...traders].sort((a, b) =>
    tab === 'pnl' ? b.totalPnl - a.totalPnl : b.volume - a.volume
  );

  const title    = tab === 'pnl' ? 'PNL LEADERBOARD' : 'VOLUME LEADERBOARD';
  const subtitle = tab === 'pnl' ? 'Top traders by total PnL' : 'Top traders by 24h volume';

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      <div>
        <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-tx-text">{title}</h1>
        <p className="text-[11px] font-mono text-tx-muted mt-1">{subtitle}</p>
      </div>

      <div className="flex gap-px bg-tx-border rounded-sm overflow-hidden w-fit">
        {(['pnl', 'volume'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[10px] font-mono uppercase tracking-[0.08em] transition-colors ${
              tab === t ? 'bg-tx-raised text-tx-green' : 'bg-tx-surface text-tx-dim hover:text-tx-muted'
            }`}
          >
            {t === 'pnl' ? 'PNL' : 'Volume'}
          </button>
        ))}
      </div>

      <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-tx-border">
              <th className="text-left px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim w-14">Rank</th>
              <th className="text-left px-3 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Wallet</th>
              <th className="text-right px-3 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Total PnL</th>
              <th className="hidden md:table-cell text-right px-3 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Win Rate</th>
              <th className="text-right px-3 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Trades</th>
              <th className="hidden md:table-cell text-right px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Volume</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[11px] font-mono text-tx-dim animate-pulse">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[11px] font-mono text-tx-dim uppercase tracking-wider">
                  No trading data yet — be the first on the board
                </td>
              </tr>
            ) : (
              sorted.map((t, i) => {
                const pnlPos = t.totalPnl >= 0;
                return (
                  <tr key={t.wallet} className="border-b border-tx-border/50 last:border-b-0 hover:bg-tx-raised transition-colors">
                    <td className="px-4 py-3">
                      <RankCell rank={i + 1} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-[11px] text-tx-text tabular-nums">{truncate(t.wallet)}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono text-[11px] font-bold tabular-nums ${pnlPos ? 'text-tx-green' : 'text-tx-red'}`}>
                        {fmtUSD(t.totalPnl)}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-3 py-3 text-right">
                      <span className="font-mono text-[11px] text-tx-muted tabular-nums">
                        {t.winRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-mono text-[11px] text-tx-muted tabular-nums">{t.trades}</span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right">
                      <span className="font-mono text-[11px] text-tx-muted tabular-nums">{fmtUSD(t.volume, 0)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] font-mono text-tx-dim text-center uppercase tracking-wider">
        Updated every 60s · Open positions only · All-time statistics
      </p>
    </main>
  );
}
