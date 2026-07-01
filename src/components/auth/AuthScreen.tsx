'use client';

import { useEffect, useState } from 'react'; // useState kept for button hover state
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
  const { loginWithWallet, loginAsGuest } = useAuth();

  // If wallet adapter auto-connects (returning Phantom user), log them in immediately.
  useEffect(() => {
    if (connected && publicKey) {
      loginWithWallet(publicKey.toBase58());
    }
  }, [connected, publicKey, loginWithWallet]);

  return (
    <div style={{ background: BG, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>

      {/* Logo */}
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
          <span style={{ color: '#f97316' }}>CS</span><span style={{ color: '#ffffff' }}>LIQUID</span>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.625rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: '0.5rem' }}>
          CS skin perpetual futures · Solana mainnet
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

        {/* ── 02 Guest ── */}
        <SectionHead n={2} label="Continue as Guest" />
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

