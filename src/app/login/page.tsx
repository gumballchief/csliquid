'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const { setVisible }                              = useWalletModal();
  const { isAuthenticated, loginWithEmail, loginAsGuest } = useAuth();
  const router                                      = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (isAuthenticated) router.replace('/trade');
  }, [isAuthenticated, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    loginWithEmail(email);
  }

  return (
    <main className="min-h-[calc(100vh-2.5rem)] bg-tx-bg flex flex-col items-center justify-center px-4 py-12">

      <div className="w-full max-w-sm mb-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-muted transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back
        </Link>
      </div>

      <div className="text-center mb-8">
        <Link href="/" className="inline-block">
          <span className="text-3xl font-mono font-black text-tx-text tracking-tighter select-none">
            CS<span className="text-tx-green">LIQUID</span>
          </span>
        </Link>
        <p className="text-[11px] font-mono text-tx-muted mt-2 tracking-wider uppercase">CS skin perpetual futures on Solana</p>
      </div>

      <div className="w-full max-w-sm bg-tx-surface border border-tx-border p-7">
        <h1 className="text-[12px] font-mono uppercase tracking-[0.08em] text-tx-text mb-6">Log In</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full bg-tx-bg border border-tx-border rounded-sm px-3 py-2.5 text-[12px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-tx-bg border border-tx-border rounded-sm px-3 py-2.5 pr-10 text-[12px] font-mono text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
              />
              <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-dim hover:text-tx-muted transition-colors">
                {showPw ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {error && <p className="text-[11px] font-mono text-tx-red">{error}</p>}

          <button type="submit"
            className="w-full py-3 bg-tx-green text-tx-bg font-mono font-bold text-[12px] uppercase tracking-[0.1em] hover:bg-[#00e87a] active:scale-[0.99] transition-all mt-1">
            LOG IN
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center border-t border-tx-border pt-5">
          <p className="text-[11px] font-mono text-tx-muted">
            No account?{' '}
            <Link href="/signup" className="text-tx-green hover:text-[#00e87a] transition-colors">Sign up</Link>
          </p>
          <Link href="/forgot-password" className="block text-[10px] font-mono text-tx-dim hover:text-tx-muted transition-colors">
            Forgot password?
          </Link>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-3">
        <button onClick={() => setVisible(true)}
          className="text-[11px] font-mono uppercase tracking-wider text-tx-green hover:text-[#00e87a] transition-colors">
          Connect wallet instead
        </button>
        <button onClick={() => loginAsGuest()}
          className="text-[10px] font-mono text-tx-dim hover:text-tx-muted transition-colors uppercase tracking-wider">
          Continue as guest
        </button>
      </div>
    </main>
  );
}

function EyeOn() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}
