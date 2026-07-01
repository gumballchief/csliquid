'use client';

import { useEffect, useState } from 'react';

// Bump this key if you ever want the welcome to re-show to everyone once more.
const SEEN_KEY = 'welcome_mainnet_seen_v1';

/**
 * One-time "Welcome to Mainnet" greeting.
 *
 * Shows exactly once per browser: the first time anyone loads the app (or the
 * first time a new user signs up / signs in) it appears on top of the landing
 * page. Dismissing it — or a page refresh — persists a flag in localStorage so
 * it never shows again.
 */
export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      // localStorage unavailable (private mode edge cases) — show once, best effort.
    }
    setVisible(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      // Ignore — worst case it shows again next load.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      className="fixed inset-0 z-[110] flex items-end md:items-center justify-center md:p-4 bg-black/75"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-[440px] flex flex-col overflow-hidden"
        style={{
          background: '#111214',
          border: '1px solid #1e2025',
          borderRadius: '4px 4px 0 0',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid #1e2025' }}>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#00ff88', margin: 0 }}>
            Now Live
          </p>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: '#e8eaed', margin: '6px 0 0' }}>
            Welcome to Mainnet
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px' }}>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#6b7280', lineHeight: 1.7, margin: 0 }}>
            <span style={{ color: '#e8eaed' }}>CSLIQUID</span> is now live on{' '}
            <span style={{ color: '#00ff88' }}>Solana Mainnet</span>. Trade CS2 skin
            perpetual futures with up to 20× leverage — long or short, settled in USDC.
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #1e2025', padding: '12px 18px' }}>
          <button
            onClick={dismiss}
            style={{
              width: '100%',
              padding: '10px 0',
              background: '#00ff88',
              color: '#0a0b0d',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity 0.1s',
            }}
          >
            Start Trading
          </button>
        </div>
      </div>
    </div>
  );
}
