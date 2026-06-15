'use client';

import { FC, ReactNode, useMemo, useEffect } from 'react';
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
    loadWallet(publicKey ? publicKey.toBase58() : null);
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

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

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
