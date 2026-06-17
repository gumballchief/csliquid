'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/layout/Logo';

// Path prefixes that require authentication
const PROTECTED_PREFIXES = [
  '/trade',
  '/portfolio',
  '/pool',
  '/stats',
  '/leaderboard',
  '/referral',
  '/prize-pool',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p + '/'),
  );
}

function WalletGate() {
  const { setVisible } = useWalletModal();
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: 'calc(100vh - 2.5rem)' }}
    >
      <div
        className="flex flex-col items-center gap-6 px-8 py-10 text-center mx-4"
        style={{
          background: '#111214',
          border: '1px solid #1e2025',
          borderRadius: 6,
          maxWidth: 360,
          width: '100%',
        }}
      >
        <Logo size={28} />

        <div className="space-y-2">
          <p className="font-mono text-[13px] font-bold uppercase tracking-[0.08em] text-[#e8eaed]">
            Connect your wallet to continue
          </p>
          <p className="font-mono text-[11px] text-[#6b7280] leading-relaxed">
            A Solana wallet is required to access this page.
          </p>
        </div>

        <button
          onClick={() => setVisible(true)}
          className="w-full py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-[#0a0b0d] hover:bg-[#00e87a] transition-colors active:scale-[0.98]"
          style={{ background: '#00ff88', borderRadius: 3 }}
        >
          Connect Wallet
        </button>
      </div>
    </div>
  );
}

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, hydrated } = useAuth();
  const pathname = usePathname();
  const [adapterReady, setAdapterReady] = useState(false);
  useEffect(() => { setAdapterReady(true); }, []);

  if (!isProtected(pathname)) return <>{children}</>;
  if (!hydrated || !adapterReady) return null;

  // Fallback: scan for any cs-futures-wallet-* key — AuthContext writes this for
  // every session wallet, so its presence means the user has an active keypair
  // even if AuthContext hasn't hydrated the user state yet.
  const hasSessionWallet = Object.keys(localStorage).some(
    k => k.startsWith('cs-futures-wallet-'),
  );

  if (isAuthenticated || hasSessionWallet) return <>{children}</>;
  return <WalletGate />;
}
