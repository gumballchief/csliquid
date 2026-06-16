'use client';

import { FC, ReactNode, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { usePositionsStore } from '@/store/positionsStore';
import { RPC_URL } from '@/lib/config';

import '@solana/wallet-adapter-react-ui/styles.css'; // wallet adapter modal/button styles

/** Watches wallet changes and loads per-wallet balance/positions from localStorage. */
function WalletStateSyncer() {
  const { publicKey } = useWallet();
  const loadWallet = usePositionsStore(s => s.loadWallet);

  useEffect(() => {
    if (publicKey) {
      loadWallet(publicKey.toBase58());
      return;
    }
    // No Phantom connected — check for a session wallet so positions aren't wiped.
    try {
      const raw = localStorage.getItem('csliquid_auth');
      if (raw) {
        const parsed = JSON.parse(raw) as { type?: string; address?: string };
        // 'email' is a legacy type — AuthContext migrates it to 'generated' on next hydration
        if ((parsed.type === 'generated' || parsed.type === 'email') && parsed.address) {
          loadWallet(parsed.address);
          return;
        }
      }
    } catch {}
    loadWallet(null);
  }, [publicKey, loadWallet]);

  return null;
}

const ADMIN_ADDRESS = 'EFm418GYQM4qxeqH5CLbndGGC2NYXtMozZtDPs6veHne';

/** Sets/clears the admin session cookie when the admin wallet connects or disconnects. */
function AdminAuthSyncer() {
  const { publicKey } = useWallet();

  useEffect(() => {
    const address = publicKey?.toBase58() ?? null;
    if (address === ADMIN_ADDRESS) {
      fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      }).catch(() => {});
    } else {
      fetch('/api/admin/auth', { method: 'DELETE' }).catch(() => {});
    }
  }, [publicKey]);

  return null;
}

interface Props {
  children: ReactNode;
}

const WalletContextProvider: FC<Props> = ({ children }) => {
  const endpoint = RPC_URL;

  // Wallet adapters use browser APIs (window.solana etc) — must be created client-side
  // only to avoid SSR/hydration mismatches (#418/#423/#425).
  const [wallets, setWallets] = useState<
    (PhantomWalletAdapter | SolflareWalletAdapter | TorusWalletAdapter)[]
  >([]);

  useEffect(() => {
    setWallets([
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
    ]);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletStateSyncer />
          <AdminAuthSyncer />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletContextProvider;
