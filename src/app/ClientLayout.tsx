'use client';

import dynamic from 'next/dynamic';
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
  const { isAuthenticated, hydrated } = useAuth();

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
    <WalletContextProvider>
      <AuthProvider>
        <AppShell>{children}</AppShell>
      </AuthProvider>
    </WalletContextProvider>
  );
}
