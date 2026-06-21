'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// ── Styles (matching app dark theme) ──────────────────────────────────────────
const BG     = '#0a0b0d';
const SURF   = '#111214';
const BORDER = '#1e2025';
const GREEN  = '#00ff88';
const ORANGE = '#f97316';
const TEXT   = '#e8eaed';
const MUTED  = '#6b7280';
const DIM    = '#374151';
const YELLOW = '#facc15';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RollResult {
  won?:         boolean;
  prize?:       string;
  value?:       number;
  streak?:      number;
  error?:       string;
  alreadyRolled?: boolean;
  eligible?:    boolean;
  reason?:      string;
  streakBonus?: boolean;
}

interface RaffleStatus {
  prize:       string;
  prizeValue:  number;
  endsAt:      string;
  ticketsPerN: number;
  lastWinner:  { wallet: string; prize: string } | null;
}

// ── Countdown hook ─────────────────────────────────────────────────────────────
function useCountdown(endsAt: string | null) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!endsAt) return;
    function tick() {
      const diff = Math.max(0, new Date(endsAt!).getTime() - Date.now());
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff / 3_600_000) % 24);
      const m = Math.floor((diff / 60_000) % 60);
      const s = Math.floor((diff / 1_000) % 60);
      setLabel(`${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`);
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [endsAt]);
  return label;
}

// ── Animated case SVG ─────────────────────────────────────────────────────────
function CaseIcon({ spinning }: { spinning: boolean }) {
  return (
    <div
      className="relative w-32 h-32 flex items-center justify-center select-none"
      style={{
        animation: spinning ? 'spin 0.6s linear infinite' : undefined,
      }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <svg viewBox="0 0 100 100" width={128} height={128} fill="none">
        {/* Case body */}
        <rect x="10" y="30" width="80" height="55" rx="4" fill="#1a1d23" stroke={ORANGE} strokeWidth="1.5" />
        {/* Case lid */}
        <rect x="10" y="20" width="80" height="15" rx="3" fill="#23262e" stroke={ORANGE} strokeWidth="1.5" />
        {/* Clasp */}
        <rect x="42" y="24" width="16" height="8" rx="2" fill={ORANGE} opacity="0.8" />
        {/* Stripes */}
        <line x1="30" y1="40" x2="30" y2="75" stroke={ORANGE} strokeWidth="0.5" opacity="0.3" />
        <line x1="50" y1="40" x2="50" y2="75" stroke={ORANGE} strokeWidth="0.5" opacity="0.3" />
        <line x1="70" y1="40" x2="70" y2="75" stroke={ORANGE} strokeWidth="0.5" opacity="0.3" />
        {/* Glow effect */}
        <rect x="10" y="30" width="80" height="55" rx="4" fill="none" stroke={ORANGE} strokeWidth="3" opacity="0.15" />
      </svg>
    </div>
  );
}

// ── Streak bar ─────────────────────────────────────────────────────────────────
function StreakBar({ count }: { count: number }) {
  const days = Array.from({ length: 7 }, (_, i) => i < count);
  return (
    <div className="flex items-center gap-1">
      {days.map((filled, i) => (
        <div
          key={i}
          className="w-8 h-2 rounded-sm transition-all"
          style={{ background: filled ? GREEN : DIM }}
        />
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function RewardsPage() {
  const { user } = useAuth();
  const wallet = user && 'address' in user ? (user as { address: string }).address : null;

  const [rolling,       setRolling]       = useState(false);
  const [result,        setResult]        = useState<RollResult | null>(null);
  const [streak,        setStreak]        = useState(0);
  const [alreadyRolled, setAlreadyRolled] = useState(false);
  const [raffle,        setRaffle]        = useState<RaffleStatus | null>(null);
  const [showHowTo,     setShowHowTo]     = useState(false);

  const raffleCountdown = useCountdown(raffle?.endsAt ?? null);

  useEffect(() => {
    fetch('/api/rewards/raffle-status')
      .then(r => r.json())
      .then(setRaffle)
      .catch(() => {});
  }, []);

  // Check on mount whether wallet has already rolled today (persisted in KV)
  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/rewards/roll-status?wallet=${encodeURIComponent(wallet)}`)
      .then(r => r.json())
      .then((data: { alreadyRolled: boolean; streak: number }) => {
        if (data.alreadyRolled) setAlreadyRolled(true);
        if (data.streak > 0) setStreak(data.streak);
      })
      .catch(() => {});
  }, [wallet]);

  const handleRoll = useCallback(async () => {
    if (!wallet || rolling) return;
    setRolling(true);
    setResult(null);

    try {
      const res  = await fetch('/api/rewards/roll', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wallet }),
      });
      const data = await res.json() as RollResult;
      setResult(data);
      if (data.streak !== undefined) setStreak(data.streak);
      if (data.alreadyRolled) setAlreadyRolled(true);
    } catch {
      setResult({ error: 'Network error — try again' });
    } finally {
      // Minimum spin time for UX
      setTimeout(() => setRolling(false), 1500);
    }
  }, [wallet, rolling]);

  const canRoll = !!wallet && !alreadyRolled && !rolling;

  return (
    <main style={{ background: BG, minHeight: '100dvh' }} className="px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ color: TEXT }} className="text-[13px] font-mono uppercase tracking-[0.08em]">Rewards</h1>
            <p style={{ color: MUTED }} className="text-[11px] font-mono mt-0.5">Daily Case Roll · Weekly Raffle · Streak Bonuses</p>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.06em] px-2 py-1 rounded-sm border"
            style={{ color: GREEN, borderColor: `${GREEN}30`, background: `${GREEN}10` }}>
            <span className="w-1.5 h-1.5 animate-pulse rounded-full" style={{ background: GREEN }} />
            Live
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* ── LEFT: Daily Case Roll ── */}
          <div style={{ background: SURF, border: `1px solid ${BORDER}` }} className="rounded p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 style={{ color: TEXT }} className="text-[13px] font-mono uppercase tracking-[0.06em] font-bold">
                  Daily Case Roll
                </h2>
                <p style={{ color: MUTED }} className="text-[10px] font-mono mt-0.5">
                  Trade $100+ collateral · 1 roll per day · 2% chance to win
                </p>
              </div>
              <button
                onClick={() => setShowHowTo(h => !h)}
                style={{ color: MUTED, border: `1px solid ${BORDER}` }}
                className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm hover:opacity-80 transition-opacity"
              >
                {showHowTo ? 'Hide' : 'How it works'}
              </button>
            </div>

            {/* How it works */}
            {showHowTo && (
              <div style={{ background: BG, border: `1px solid ${BORDER}` }} className="rounded p-4 space-y-2.5">
                {[
                  ['01', 'Make a trade with $100+ collateral on any market'],
                  ['02', 'Tap ROLL CASE — one roll per calendar day'],
                  ['03', '2% chance to win a real CS2 skin (delivered via voucher or USDC equivalent)'],
                  ['04', 'Roll 7 days straight for a STREAK BONUS — 25% win chance on day 7'],
                ].map(([n, t]) => (
                  <div key={n} className="flex gap-3">
                    <span style={{ color: ORANGE }} className="text-[9px] font-mono font-bold shrink-0 mt-0.5">{n}</span>
                    <span style={{ color: MUTED }} className="text-[10px] font-mono leading-relaxed">{t}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Case + Roll button */}
            <div className="flex flex-col items-center gap-5 py-4">
              <CaseIcon spinning={rolling} />

              {/* Streak */}
              {streak > 0 && (
                <div className="flex flex-col items-center gap-2">
                  <p style={{ color: ORANGE }} className="text-[10px] font-mono font-bold uppercase tracking-wider">
                    🔥 Day {streak} of 7 {streak >= 6 ? '— BONUS ACTIVE!' : ''}
                  </p>
                  <StreakBar count={streak} />
                </div>
              )}

              {/* Roll button */}
              <button
                onClick={handleRoll}
                disabled={!canRoll}
                style={{
                  background: canRoll ? ORANGE : DIM,
                  color:      canRoll ? '#000' : MUTED,
                  cursor:     canRoll ? 'pointer' : 'default',
                  opacity:    rolling ? 0.8 : 1,
                }}
                className="w-full max-w-xs py-3 font-mono text-[11px] uppercase tracking-[0.1em] font-bold rounded-sm transition-all"
              >
                {rolling ? 'Rolling…' : alreadyRolled ? 'Rolled Today ✓' : !wallet ? 'Connect Wallet First' : 'Roll Case →'}
              </button>

              {/* Eligibility hint */}
              {wallet && !alreadyRolled && !rolling && !result && (
                <p style={{ color: DIM }} className="text-[9px] font-mono text-center">
                  Trade $100+ collateral today to unlock your roll
                </p>
              )}
            </div>

            {/* Result */}
            {result && (
              <div style={{
                background: result.won ? `${GREEN}10` : BG,
                border:     `1px solid ${result.won ? `${GREEN}40` : BORDER}`,
              }} className="rounded p-4 text-center space-y-2">
                {result.won ? (
                  <>
                    <p style={{ color: GREEN }} className="text-[16px] font-mono font-bold uppercase tracking-wider">
                      🎉 You Won!
                    </p>
                    <p style={{ color: TEXT }} className="text-[13px] font-mono font-bold">{result.prize}</p>
                    <p style={{ color: GREEN }} className="text-[11px] font-mono">
                      Value: ~${result.value?.toLocaleString()}
                    </p>
                    <p style={{ color: MUTED }} className="text-[9px] font-mono mt-2">
                      Prize delivery via Skinport voucher or USDC equivalent. Contact @CSLiquidSOL on X.
                    </p>
                    {/* Share button */}
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just won a ${result.prize} worth $${result.value?.toLocaleString()} on @CSLiquidSOL! Trade CS2 skin perps on Solana 🎮 csliquid.xyz`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ background: '#1d9bf0', color: '#fff' }}
                      className="inline-block mt-3 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-wider rounded-sm hover:opacity-90 transition-opacity"
                    >
                      Share on X →
                    </a>
                  </>
                ) : result.error ? (
                  <>
                    <p style={{ color: MUTED }} className="text-[12px] font-mono">{result.error}</p>
                    {result.reason && (
                      <p style={{ color: DIM }} className="text-[10px] font-mono">{result.reason}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p style={{ color: TEXT }} className="text-[12px] font-mono font-bold">Better luck tomorrow</p>
                    <p style={{ color: MUTED }} className="text-[10px] font-mono">
                      Streak: Day {result.streak ?? 0} of 7 · Keep rolling daily for your streak bonus
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: column ── */}
          <div className="space-y-4">
            {/* Weekly Raffle */}
            <div style={{ background: SURF, border: `1px solid ${BORDER}` }} className="rounded p-4 space-y-4">
              <div>
                <h2 style={{ color: TEXT }} className="text-[11px] font-mono uppercase tracking-[0.08em] font-bold">
                  $CSLIQ Holder Raffle
                </h2>
                <p style={{ color: MUTED }} className="text-[9px] font-mono mt-0.5">
                  Hold $CSLIQ tokens for weekly prize draws
                </p>
              </div>

              {raffle ? (
                <div className="space-y-3">
                  <div style={{ background: BG, border: `1px solid ${BORDER}` }} className="rounded p-3">
                    <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest mb-1">This Week&apos;s Prize</p>
                    <p style={{ color: ORANGE }} className="text-[11px] font-mono font-bold">{raffle.prize}</p>
                    <p style={{ color: GREEN }} className="text-[10px] font-mono">~${raffle.prizeValue.toLocaleString()}</p>
                  </div>
                  <div style={{ background: BG, border: `1px solid ${BORDER}` }} className="rounded p-3">
                    <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest mb-1">Drawing In</p>
                    <p style={{ color: YELLOW }} className="text-[11px] font-mono font-bold tabular-nums">{raffleCountdown}</p>
                  </div>
                  <div style={{ background: BG, border: `1px solid ${BORDER}` }} className="rounded p-3 space-y-1">
                    <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest mb-1">Tickets</p>
                    <p style={{ color: MUTED }} className="text-[9px] font-mono">
                      1 ticket = {(raffle.ticketsPerN / 1000).toFixed(0)}K $CSLIQ held
                    </p>
                    <p style={{ color: DIM }} className="text-[9px] font-mono">
                      Winner picked via on-chain Solana slot hash (verifiable)
                    </p>
                  </div>
                  {raffle.lastWinner && (
                    <div style={{ background: `${ORANGE}10`, border: `1px solid ${ORANGE}30` }} className="rounded p-3">
                      <p style={{ color: DIM }} className="text-[8px] font-mono uppercase tracking-widest mb-1">Last Winner</p>
                      <p style={{ color: TEXT }} className="text-[10px] font-mono font-bold">
                        {raffle.lastWinner.wallet.slice(0, 4)}…{raffle.lastWinner.wallet.slice(-4)}
                      </p>
                      <p style={{ color: MUTED }} className="text-[9px] font-mono">{raffle.lastWinner.prize}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: DIM }} className="text-[10px] font-mono text-center py-4">Loading…</div>
              )}
            </div>

            {/* Streak milestones */}
            <div style={{ background: SURF, border: `1px solid ${BORDER}` }} className="rounded p-4 space-y-3">
              <h2 style={{ color: TEXT }} className="text-[11px] font-mono uppercase tracking-[0.08em] font-bold">
                Streak Milestones
              </h2>
              {[
                { days: 7,   reward: '25% win chance on next roll',      color: ORANGE },
                { days: 30,  reward: 'Exclusive CSLIQUID badge',         color: '#a78bfa' },
                { days: 100, reward: 'Lifetime fee discount + rare skin', color: YELLOW },
              ].map(({ days, reward, color }) => (
                <div key={days} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-sm flex items-center justify-center border shrink-0"
                    style={{ background: `${color}15`, borderColor: `${color}40` }}>
                    <span style={{ color }} className="text-[10px] font-mono font-bold">{days}d</span>
                  </div>
                  <p style={{ color: MUTED }} className="text-[9px] font-mono">{reward}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
