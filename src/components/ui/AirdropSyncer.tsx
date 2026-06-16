'use client';

import { useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useAuth } from '@/contexts/AuthContext';
import { useToastStore } from '@/store/toastStore';
import { fetchUserAccountBalance, sendDepositKeypair } from '@/lib/program';
import { decodeBase58 } from '@/lib/base58';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const SOL_AIRDROP_LAMPORTS = Math.floor(0.1 * LAMPORTS_PER_SOL);
const SOL_MIN_LAMPORTS     = Math.floor(0.05 * LAMPORTS_PER_SOL);

/** Silently request devnet SOL; tries configured RPC then falls back to public devnet. */
async function ensureSol(connection: Connection, pubkey: PublicKey): Promise<void> {
  const bal = await connection.getBalance(pubkey).catch(() => 0);
  if (bal >= SOL_MIN_LAMPORTS) return;

  const tryAirdrop = async (conn: Connection): Promise<boolean> => {
    try {
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      const sig = await conn.requestAirdrop(pubkey, SOL_AIRDROP_LAMPORTS);
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      return true;
    } catch {
      return false;
    }
  };

  if (!(await tryAirdrop(connection))) {
    const devConn = new Connection(DEVNET_RPC, 'confirmed');
    await tryAirdrop(devConn);
  }
}

/**
 * Detects first-time users (no on-chain UserAccount) and:
 *  1. Calls POST /api/airdrop to transfer 10,000 USDC from admin ATA → user ATA
 *  2. For session wallets: airdrops devnet SOL for gas, then auto-deposits the
 *     USDC into the vault so AVAIL shows $10,000 immediately
 *  3. Shows a welcome info toast with the tx link
 *
 * Must be rendered inside both <WalletContextProvider> and <AuthProvider>.
 */
export default function AirdropSyncer() {
  const { connected, publicKey } = useWallet();
  const { connection }           = useConnection();
  const { user, hydrated }       = useAuth();
  const addInfo                  = useToastStore((s) => s.addInfo);
  const triggered                = useRef(new Set<string>());

  const signerAddress =
    connected && publicKey
      ? publicKey.toBase58()
      : user?.type === 'generated' ? user.address : null;

  useEffect(() => {
    if (!hydrated || !signerAddress) return;
    if (triggered.current.has(signerAddress)) return;

    // Don't re-check within the same browser session
    const sessionKey = `airdrop_checked_${signerAddress}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionKey)) return;

    triggered.current.add(signerAddress);
    let cancelled = false;

    (async () => {
      try {
        // Only trigger for brand-new users (UserAccount PDA doesn't exist yet)
        const balance = await fetchUserAccountBalance(connection, new PublicKey(signerAddress));
        if (balance !== null) {
          // Returning user — mark checked and bail
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(sessionKey, 'existing');
          return;
        }

        const res  = await fetch('/api/airdrop', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ wallet: signerAddress }),
        });
        const data = await res.json() as {
          success?: boolean;
          tx?: string;
          already?: boolean;
          error?: string;
        };

        if (cancelled) return;

        if (data.already) {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(sessionKey, 'done');
          return;
        }
        if (!data.success || !data.tx) return;

        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(sessionKey, 'done');

        // Session wallet: auto-deposit into vault so AVAIL shows $10,000 immediately
        if (user?.type === 'generated') {
          const kpRaw =
            typeof localStorage !== 'undefined' ? localStorage.getItem('guest_keypair') : null;

          if (kpRaw) {
            const signer = Keypair.fromSecretKey(decodeBase58(kpRaw));

            // Ensure session wallet has SOL for gas, then deposit
            await ensureSol(connection, signer.publicKey);

            // Brief pause so USDC airdrop tx is fully settled on-chain
            await new Promise<void>(r => setTimeout(r, 2_500));
            if (cancelled) return;

            try {
              await sendDepositKeypair(connection, signer, 10_000);
              addInfo('Welcome to CSLIQUID! $10,000 USDC is ready to trade.', data.tx);
            } catch {
              // Deposit failed (SOL unavailable etc.) — USDC is in ATA; user deposits manually
              addInfo('$10,000 USDC airdropped to your wallet!', data.tx);
            }
            return;
          }
        }

        // Phantom / external wallet: USDC is in their ATA; they deposit via UI
        addInfo('$10,000 USDC airdropped! Deposit it on the trade page to start trading.', data.tx);
      } catch {
        // Silent fail — never block the UI
      }
    })();

    return () => { cancelled = true; };
  }, [hydrated, signerAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
