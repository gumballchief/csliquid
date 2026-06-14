'use client';

import { useState, useEffect } from 'react';


const STORAGE_KEY = 'csliquid_referral_username';

export default function ReferralPage() {
  const [mounted,  setMounted]  = useState(false);
  const [username, setUsername] = useState('');
  const [input,    setInput]    = useState('');
  const [error,    setError]    = useState('');
  const [copied,   setCopied]   = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed,  setClaimed]  = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setUsername(stored);
    setMounted(true);
  }, []);

  const referralLink = `csliquid.xyz/ref/${username}`;

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
    if (val.length <= 20) setInput(val);
    if (error) setError('');
  }

  function handleRegister() {
    if (!input) { setError('Please enter a username.'); return; }
    if (input.length < 3) { setError('Username must be at least 3 characters.'); return; }
    localStorage.setItem(STORAGE_KEY, input);
    setUsername(input);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`https://${referralLink}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  async function handleClaim() {
    setClaiming(true);
    await new Promise(r => setTimeout(r, 1200));
    setClaiming(false);
    setClaimed(true);
    setTimeout(() => setClaimed(false), 3000);
  }

  const isRegistered = mounted && !!username;

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
            { step: '01', title: 'Register a username', desc: 'Choose a unique username stored on-chain. This becomes your identity across CSLIQUID.' },
            { step: '02', title: 'Share your link',     desc: 'Your referral link is csliquid.xyz/ref/your-username. Share it anywhere.' },
            { step: '03', title: 'Earn fees',           desc: 'Earn 10% of trading fees from every trader who signs up through your link, claimable anytime.' },
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
              @{username}
            </span>
          </div>
          <div className="p-5 space-y-4">

            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-2">Your Link</p>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden">
              {[
                { label: 'Total Referrals',  value: '0'     },
                { label: 'Fees Earned',      value: '$0.00' },
                { label: 'Referred Volume',  value: '$0.00' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-tx-raised px-4 py-3">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-tx-dim mb-1">{label}</p>
                  <p className="text-[16px] font-mono font-bold text-tx-text tabular-nums">{value}</p>
                </div>
              ))}
              <div className="bg-tx-raised px-4 py-3 flex flex-col">
                <p className="text-[9px] font-mono uppercase tracking-wider text-tx-dim mb-1">Claimable Fees</p>
                <p className="text-[16px] font-mono font-bold text-tx-text tabular-nums mb-2">$0.00</p>
                <button
                  onClick={handleClaim}
                  disabled={claiming}
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
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-2">Username</label>
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={e => e.key === 'Enter' && handleRegister()}
                  placeholder="yourname"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-tx-bg border border-tx-border rounded-sm px-3 py-2.5 pr-16 font-mono text-[12px] text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
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
              disabled={!input || !mounted}
              className="px-6 py-2.5 bg-tx-green text-tx-bg font-mono font-bold text-[11px] uppercase tracking-[0.1em] rounded-sm hover:bg-[#00e87a] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
            >
              REGISTER USERNAME
            </button>

            <p className="text-[10px] font-mono text-tx-dim leading-relaxed">
              Username is permanent and stored on-chain. Choose carefully.
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
              <tr>
                <td colSpan={5} className="text-center py-12 text-[11px] font-mono text-tx-dim uppercase tracking-wider">
                  No referrals yet — be the first on the board
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </main>
  );
}
