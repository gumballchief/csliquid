'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/contexts/AuthContext';

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

export default function SignupPage() {
  const { setVisible }                                    = useWalletModal();
  const { isAuthenticated, loginWithEmail, loginAsGuest } = useAuth();
  const router                                            = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [showCf,   setShowCf]   = useState(false);
  const [errors,   setErrors]   = useState<{ email?: string; password?: string; confirm?: string; form?: string }>({});
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace('/trade');
  }, [isAuthenticated, router]);

  function validate() {
    const e: typeof errors = {};
    if (!email) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 6) e.password = 'Min 6 characters.';
    if (!confirm) e.confirm = 'Please confirm your password.';
    else if (confirm !== password) e.confirm = 'Passwords do not match.';
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setErrors({ form: data.error ?? 'Sign up failed.' }); return; }
      loginWithEmail(email.trim().toLowerCase());
    } catch {
      setErrors({ form: 'Network error — try again.' });
    } finally {
      setLoading(false);
    }
  }

  const inputBase = 'w-full bg-tx-bg border rounded-sm px-3 py-2.5 text-[12px] font-mono text-tx-text placeholder-tx-dim focus:outline-none transition-colors';
  const inputClass = (hasError: boolean) =>
    `${inputBase} ${hasError ? 'border-tx-red focus:border-tx-red' : 'border-tx-border focus:border-tx-border2'}`;

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
        <h1 className="text-[12px] font-mono uppercase tracking-[0.08em] text-tx-text mb-6">Create Account</h1>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-1.5">Email</label>
            <input type="email" value={email} autoComplete="email" placeholder="you@example.com"
              onChange={e => { setEmail(e.target.value); setErrors(v => ({ ...v, email: undefined })); }}
              className={inputClass(!!errors.email)} />
            {errors.email && <p className="mt-1 text-[11px] font-mono text-tx-red">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-1.5">
              Password <span className="text-tx-dim font-normal normal-case">(min. 6 chars)</span>
            </label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} autoComplete="new-password" placeholder="••••••••"
                onChange={e => { setPassword(e.target.value); setErrors(v => ({ ...v, password: undefined })); }}
                className={`${inputClass(!!errors.password)} pr-10`} />
              <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-dim hover:text-tx-muted transition-colors">
                {showPw ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-[11px] font-mono text-tx-red">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-1.5">Confirm Password</label>
            <div className="relative">
              <input type={showCf ? 'text' : 'password'} value={confirm} autoComplete="new-password" placeholder="••••••••"
                onChange={e => { setConfirm(e.target.value); setErrors(v => ({ ...v, confirm: undefined })); }}
                className={`${inputClass(!!errors.confirm)} pr-10`} />
              <button type="button" tabIndex={-1} onClick={() => setShowCf(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-dim hover:text-tx-muted transition-colors">
                {showCf ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
            {errors.confirm && <p className="mt-1 text-[11px] font-mono text-tx-red">{errors.confirm}</p>}
          </div>

          {errors.form && <p className="text-[11px] font-mono text-tx-red">{errors.form}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-tx-green text-tx-bg font-mono font-bold text-[12px] uppercase tracking-[0.1em] hover:bg-[#00e87a] active:scale-[0.99] transition-all mt-1 disabled:opacity-60">
            {loading ? '…' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div className="mt-5 text-center border-t border-tx-border pt-5">
          <p className="text-[11px] font-mono text-tx-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-tx-green hover:text-[#00e87a] transition-colors">Log in</Link>
          </p>
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
