'use client';

import { useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { Program } from '@coral-xyz/anchor';
import { getProgram } from '@/lib/program';

/**
 * Returns an Anchor `Program` instance when a wallet is fully connected,
 * or `null` if the wallet is not yet connected / missing sign methods.
 *
 * Usage:
 *   const program = useProgram();
 *   if (!program) return; // wallet not ready
 *   await sendOpenPosition(program, owner, args);
 */
export function useProgram(): Program | null {
  const { connection } = useConnection();
  const wallet         = useWallet();

  return useMemo(() => {
    if (
      !wallet.connected ||
      !wallet.publicKey ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions
    ) {
      return null;
    }
    try {
      return getProgram(connection, wallet);
    } catch {
      return null;
    }
  }, [connection, wallet]);
}
