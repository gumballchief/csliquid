'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'csliquid_referral';

interface ReferrerStats {
  username:  string;
  referrals: number;
  volume:    number;
  fees:      number;
  claimable: number;
}

interface LeaderboardEntry {
  rank:      number;
  username:  string;
  wallet:    string;
  referrals: number;
  volume:    number;
  fees:      number;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function rankBadge(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export default function ReferralPage() {
  const { connected, publicKey } = useWallet();
  const { user }                 = useAuth();

  const generatedAddress = user?.type === 'generated' ? user.address : null;
  const walletAddress    = (connected && publicKey) ? publicKey.toBase58() : generatedAddress;

  const [mounted,     setMounted]     = useState(false);
  const [stats,       setStats]       = useState<ReferrerStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading,   setLbLoading]   = useState(true);

  const [input,       setInput]       = useState('');
  const [error,       setError]       = useState('');
  const [registering, setRegistering] = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [claiming,    setClaiming]    = useState(false);
  const [claimed,     setClaimed]     = useState(false);

  // ── Fetch referrer stats from API ──────────────────────────────────────────
  const fetchStats = useCallback(async (wallet: string) => {
    try {
      const res = await fetch(`/api/referral/stats?wallet=${wallet}`);
      if (!res.ok) return;
      const data = await res.json() as ({ registered: false } | (ReferrerStats & { registered: true }));
      if (data.registered) {
        setStats(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: data.username, wallet }));
      }
    } catch {}
  }, []);

  // ── Fetch leaderboard ──────────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async () => {
    setLbLoading(true);
    try {
      const res = await fetch('/api/referral/leaderboard');
      if (res.ok) setLeaderboard(await res.json());
    } catch {}
    setLbLoading(false);
  }, []);

  // ── Mount: load cached state, then verify against API ─────────────────────
  useEffect(() => {
    // Restore cached username from localStorage for instant UI
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const cached = JSON.parse(raw) as { username: string; wallet?: string };
        if (cached.username) setStats(prev => prev ?? { username: cached.username, referrals: 0, volume: 0, fees: 0, claimable: 0 });
      } catch {}
    }
    setMounted(true);
  }, []);

  // ── When wallet address becomes available, hit the stats API ──────────────
  useEffect(() => {
    if (mounted && walletAddress) fetchStats(walletAddress);
  }, [mounted, walletAddress, fetchStats]);

  useEffect(() => {
    if (mounted) fetchLeaderboard();
  }, [mounted, fetchLeaderboard]);

  // ── Register ───────────────────────────────────────────────────────────────
  async function handleRegister() {
    if (!walletAddress) { setError('Connect your wallet first.'); return; }
    if (!input)         { setError('Please enter a username.'); return; }
    if (input.length < 3) { setError('Username must be at least 3 characters.'); return; }

    setRegistering(true);
    setError('');
    try {
      const res  = await fetch('/api/referral/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wallet: walletAddress, username: input }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        setError((data.error as string) || 'Registration failed.');
      } else {
        const s: ReferrerStats = {
          username:  data.username  as string,
          referrals: data.referrals as number,
          volume:    data.volume    as number,
          fees:      data.fees      as number,
          claimable: data.claimable as number,
        };
        setStats(s);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: s.username, wallet: walletAddress }));
        fetchLeaderboard();
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setRegistering(false);
  }

  async function handleCopy() {
    if (!stats?.username) return;
    try {
      await navigator.clipboard.writeText(`https://csliquid.xyz/ref/${stats.username}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleClaim() {
    setClaiming(true);
    // TODO: on-chain claim or off-chain payout
    await new Promise(r => setTimeout(r, 1000));
    setClaiming(false);
    setClaimed(true);
    setTimeout(() => setClaimed(false), 3000);
  }

  const isRegistered = mounted && !!stats;
  const referralLink = `csliquid.xyz/ref/${stats?.username ?? ''}`;

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">

      <div>
        <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-tx-text">Referral Program</h1>
        <p className="text-[11px] font-mono text-tx-muted mt-1">Earn fees from traders you refer</p>
      </div>

      {/* How it works */}
      <section>
        <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-tx-dim mb-3">How It Works</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">
          {[
            { step: '01', title: 'Register a username', desc: 'Choose a unique username. This becomes your referral identity on CSLIQUID.' },
            { step: '02', title: 'Share your link',     desc: 'Your link is csliquid.xyz/ref/your-username. Share it anywhere.' },
            { step: '03', title: 'Earn fees',           desc: 'Earn 10% of trading fees from every trader who signs up through your link.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-tx-surface p-5">
              <span className="font-mono text-4xl font-black text-tx-raised leading-none block mb-3 select-none">{step}</span>
              <p className="font-mono text-[11px] font-bold text-tx-text mb-1.5">{title}</p>
              <p className="text-[11px] font-mono text-tx-dim leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Register or Stats */}
      {isRegistered ? (
        <section className="bg-tx-surface border border-tx-border rounded overflow-hidden">
          <div className="px-5 py-3 border-b border-tx-border flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-tx-muted">Your Referral Stats</p>
            <span className="font-mono text-[10px] px-2 py-0.5 bg-tx-raised border border-tx-border text-tx-muted">
              @{stats!.username}
            </span>
          </div>
          <div className="p-5 space-y-4">

            {/* Referral link */}
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-2">Your Referral Link</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 bg-tx-bg border border-tx-border rounded-sm px-3 py-2 font-mono text-[11px] text-tx-muted truncate">
                  {referralLink}
                </div>
                <button
                  onClick={handleCopy}
                  className={`shrink-0 px-3 py-2 rounded-sm text-[10px] font-mono uppercase tracking-wider border transition-all ${
                    copied
                      ? 'bg-tx-green/10 border-tx-green/30 text-tx-green'
                      : 'bg-tx-bg border-tx-border text-tx-muted hover:text-tx-text hover:border-tx-border2'
                  }`}
                >
                  {copied ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden">
              <div className="bg-tx-raised px-4 py-3">
                <p className="text-[9px] font-mono uppercase tracking-wider text-tx-dim mb-1">Total Referrals</p>
                <p className="text-[16px] font-mono font-bold text-tx-text tabular-nums">{stats!.referrals}</p>
              </div>
              <div className="bg-tx-raised px-4 py-3">
                <p className="text-[9px] font-mono uppercase tracking-wider text-tx-dim mb-1">Fees Earned</p>
                <p className="text-[16px] font-mono font-bold text-tx-text tabular-nums">{fmt$(stats!.fees)}</p>
              </div>
              <div className="bg-tx-raised px-4 py-3">
                <p className="text-[9px] font-mono uppercase tracking-wider text-tx-dim mb-1">Volume Referred</p>
                <p className="text-[16px] font-mono font-bold text-tx-text tabular-nums">{fmt$(stats!.volume)}</p>
              </div>
              <div className="bg-tx-raised px-4 py-3 flex flex-col">
                <p className="text-[9px] font-mono uppercase tracking-wider text-tx-dim mb-1">Claimable Fees</p>
                <p className="text-[16px] font-mono font-bold text-tx-text tabular-nums mb-2">{fmt$(stats!.claimable)}</p>
                <button
                  onClick={handleClaim}
                  disabled={claiming || stats!.claimable === 0}
                  className={`mt-auto w-full py-1.5 rounded-sm text-[10px] font-mono uppercase tracking-wider border transition-all ${
                    claimed
                      ? 'bg-tx-green/10 border-tx-green/30 text-tx-green'
                      : 'border-tx-green/40 text-tx-green hover:bg-tx-green/10 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {claiming ? 'CLAIMING…' : claimed ? 'CLAIMED!' : 'CLAIM FEES'}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-tx-surface border border-tx-border rounded overflow-hidden">
          <div className="px-5 py-3 border-b border-tx-border">
            <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-tx-muted">Register Username</p>
          </div>
          <div className="p-5 space-y-4 max-w-md">
            {!walletAddress && mounted && (
              <div className="text-[11px] font-mono text-tx-dim bg-tx-raised border border-tx-border rounded-sm px-3 py-2.5">
                Connect your wallet to register a referral username.
              </div>
            )}
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-2">Username</label>
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={e => {
                    const v = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                    if (v.length <= 20) setInput(v);
                    if (error) setError('');
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleRegister()}
                  placeholder="yourname"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!walletAddress}
                  className="w-full bg-tx-bg border border-tx-border rounded-sm px-3 py-2.5 pr-16 font-mono text-[12px] text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors disabled:opacity-50"
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono pointer-events-none ${
                  input.length >= 18 ? 'text-yellow-400' : 'text-tx-dim'
                }`}>
                  {input.length}/20
                </span>
              </div>
              {error && (
                <p className="mt-2 text-[11px] font-mono text-tx-red bg-tx-red/5 border border-tx-red/20 rounded-sm px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <button
              onClick={handleRegister}
              disabled={!input || !mounted || !walletAddress || registering}
              className="px-6 py-2.5 bg-tx-green text-tx-bg font-mono font-bold text-[11px] uppercase tracking-[0.1em] rounded-sm hover:bg-[#00e87a] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
            >
              {registering ? 'REGISTERING…' : 'REGISTER USERNAME'}
            </button>

            <p className="text-[10px] font-mono text-tx-dim leading-relaxed">
              Username is permanent and unique. 3–20 characters, letters/numbers/underscores.
            </p>
          </div>
        </section>
      )}

      {/* Leaderboard */}
      <section>
        <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-tx-dim mb-3">Referral Leaderboard</p>
        <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-tx-border">
                <th className="text-left px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim w-14">Rank</th>
                <th className="text-left px-3 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Username</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Referrals</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim hidden sm:table-cell">Volume Referred</th>
                <th className="text-right px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim">Fees Earned</th>
              </tr>
            </thead>
            <tbody>
              {lbLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-[11px] font-mono text-tx-dim uppercase tracking-wider">
                    Loading…
                  </td>
                </tr>
              ) : leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-[11px] font-mono text-tx-dim uppercase tracking-wider">
                    No referrals yet — be the first on the board
                  </td>
                </tr>
              ) : leaderboard.map(entry => (
                <tr
                  key={entry.wallet}
                  className={`border-b border-tx-border last:border-0 hover:bg-tx-raised transition-colors ${
                    entry.wallet === walletAddress ? 'bg-tx-green/5' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-[11px] text-tx-dim">
                    {rankBadge(entry.rank)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-[11px] text-tx-text">
                      @{entry.username}
                    </span>
                    {entry.wallet === walletAddress && (
                      <span className="ml-2 text-[9px] font-mono text-tx-green uppercase tracking-wider">you</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[11px] text-tx-muted tabular-nums">
                    {entry.referrals}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[11px] text-tx-dim tabular-nums hidden sm:table-cell">
                    {fmt$(entry.volume)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] font-bold text-tx-green tabular-nums">
                    {fmt$(entry.fees)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </main>
  );
}
