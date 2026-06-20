'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/contexts/AuthContext';

const BG     = '#0a0b0d';
const SURF   = '#111214';
const BORDER = '#1e2025';
const BORDER2 = '#2a2d35';
const GREEN  = '#00ff88';
const GREEN2 = '#00e87a';
const TEXT   = '#e8eaed';
const MUTED  = '#6b7280';
const DIM    = '#374151';
const RED    = '#ff4444';

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  background: BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  color: TEXT,
  outline: 'none',
  boxSizing: 'border-box',
};

function Num({ n }: { n: number }) {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: DIM, fontWeight: 700, minWidth: 18, lineHeight: 1 }}>
      {String(n).padStart(2, '0')}
    </span>
  );
}

function SectionHead({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
      <Num n={n} />
      <span style={{ fontFamily: 'monospace', fontSize: '0.6875rem', fontWeight: 700, color: TEXT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
    </div>
  );
}

function Rule() {
  return <div style={{ height: 1, background: BORDER, margin: '1.25rem 0' }} />;
}

export default function AuthScreen() {
  const { connected, publicKey } = useWallet();
  const { setVisible }           = useWalletModal();
  const { loginWithWallet, loginWithEmail, loginAsGuest } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [err,      setErr]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // If wallet adapter auto-connects (returning Phantom user), log them in immediately.
  useEffect(() => {
    if (connected && publicKey) {
      loginWithWallet(publicKey.toBase58());
    }
  }, [connected, publicKey, loginWithWallet]);

  async function handleEmail(mode: 'login' | 'signup') {
    const e = email.trim().toLowerCase();
    if (!e || !password) { setErr('Fill in both fields.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr('Enter a valid email address.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setErr('');
    setLoading(true);
    try {
      const res  = await fetch(`/api/auth/${mode}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: e, password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setErr(data.error ?? 'Something went wrong.'); return; }
      loginWithEmail(e);
    } catch {
      setErr('Network error — try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: BG, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>

      {/* Logo */}
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 900, color: TEXT, letterSpacing: '-0.02em', lineHeight: 1 }}>
          CS<span style={{ color: GREEN }}>LIQUID</span>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.625rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: '0.5rem' }}>
          CS skin perpetual futures · Solana devnet
        </div>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 400, background: SURF, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '1.5rem' }}>

        {/* ── 01 Connect Wallet ── */}
        <SectionHead n={1} label="Connect Wallet" />
        <p style={{ fontFamily: 'monospace', fontSize: '0.6875rem', color: MUTED, marginBottom: '0.875rem', lineHeight: 1.5 }}>
          Use Phantom, Solflare, or any Solana wallet.
        </p>
        <GreenBtn onClick={() => setVisible(true)}>
          Connect Wallet →
        </GreenBtn>

        <Rule />

        {/* ── 02 Email ── */}
        <SectionHead n={2} label="Sign Up / Log In" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <input
            ref={emailRef}
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setErr(''); }}
            placeholder="you@example.com"
            autoComplete="email"
            style={INPUT}
            onFocus={e => (e.currentTarget.style.borderColor = BORDER2)}
            onBlur={e  => (e.currentTarget.style.borderColor = BORDER)}
          />
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setErr(''); }}
              placeholder="Password (min. 6 chars)"
              autoComplete="current-password"
              style={{ ...INPUT, paddingRight: '2.5rem' }}
              onFocus={e => (e.currentTarget.style.borderColor = BORDER2)}
              onBlur={e  => (e.currentTarget.style.borderColor = BORDER)}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: 0, lineHeight: 1 }}
            >
              {showPw ? <EyeOff /> : <EyeOn />}
            </button>
          </div>
          {err && (
            <p style={{ fontFamily: 'monospace', fontSize: '0.6875rem', color: RED }}>{err}</p>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <GhostBtn onClick={() => handleEmail('login')} disabled={loading}>
            {loading ? '…' : 'LOG IN'}
          </GhostBtn>
          <GhostBtn onClick={() => handleEmail('signup')} disabled={loading}>
            {loading ? '…' : 'SIGN UP'}
          </GhostBtn>
        </div>

        <Rule />

        {/* ── 03 Guest ── */}
        <SectionHead n={3} label="Continue as Guest" />
        <p style={{ fontFamily: 'monospace', fontSize: '0.6875rem', color: MUTED, marginBottom: '0.875rem', lineHeight: 1.5 }}>
          A temporary wallet is generated for this browser.{' '}
          <span style={{ color: TEXT }}>SAVE ACCOUNT</span> is available throughout the app to preserve it.
        </p>
        <GhostBtn onClick={loginAsGuest}>
          Continue as Guest →
        </GhostBtn>
      </div>
    </div>
  );
}

// ── Shared button components ──────────────────────────────────────────────────

function GreenBtn({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        padding: '0.75rem',
        background: hover ? GREEN2 : GREEN,
        color: BG,
        fontFamily: 'monospace',
        fontSize: '0.6875rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        border: 'none',
        borderRadius: 3,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.15s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        padding: '0.625rem',
        background: hover ? '#1a1d23' : 'transparent',
        color: hover ? TEXT : MUTED,
        fontFamily: 'monospace',
        fontSize: '0.6875rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        border: `1px solid ${hover ? BORDER2 : BORDER}`,
        borderRadius: 3,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function EyeOn() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}
