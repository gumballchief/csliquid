'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';
import AuthScreen from '@/components/auth/AuthScreen';
import Header from '@/components/layout/Header';
import PriceTicker from '@/components/layout/PriceTicker';
import TxToastContainer from '@/components/ui/TxToast';
import AirdropSyncer from '@/components/ui/AirdropSyncer';
import TosModal from '@/components/TosModal';

// ssr:false keeps wallet adapter constructors (window.solana etc) out of SSR
const WalletContextProvider = dynamic(
  () => import('@/contexts/WalletContextProvider'),
  { ssr: false },
);

/**
 * Inner shell — must live inside AuthProvider so it can read auth state.
 * Shows the full-page AuthScreen until the user has chosen how to log in.
 */
function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated, user, logout } = useAuth();
  const { connected } = useWallet();
  const prevConnectedRef = useRef(false);

  // When Phantom goes connected → disconnected, clear wallet-type auth so
  // the three-option screen shows rather than leaving the user in a broken state.
  useEffect(() => {
    const wasConnected = prevConnectedRef.current;
    prevConnectedRef.current = connected;
    if (wasConnected && !connected && user?.type === 'wallet') {
      logout();
    }
  }, [connected, user, logout]);

  // Render nothing until localStorage has been read to avoid flash.
  if (!hydrated) return null;

  // New visitor or explicit logout — show the three-option auth screen.
  if (!isAuthenticated) return <AuthScreen />;

  // Authenticated — render the full app.
  return (
    <>
      <AirdropSyncer />
      <TosModal />
      <PriceTicker />
      <Header />
      <AuthGuard>
        {children}
      </AuthGuard>
      <TxToastContainer />
    </>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WalletContextProvider>
        <AppShell>{children}</AppShell>
      </WalletContextProvider>
    </AuthProvider>
  );
}
