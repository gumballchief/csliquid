'use client';

import dynamic from 'next/dynamic';
import { AuthProvider } from '@/contexts/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';
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

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletContextProvider>
      <AuthProvider>
        <AirdropSyncer />
        <TosModal />
        <PriceTicker />
        <Header />
        <AuthGuard>
          {children}
        </AuthGuard>
        <TxToastContainer />
      </AuthProvider>
    </WalletContextProvider>
  );
}
