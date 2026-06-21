'use client';

import { useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useAuth } from '@/contexts/AuthContext';
import { useToastStore } from '@/store/toastStore';
import { fetchUserAccountBalance, sendDepositKeypair } from '@/lib/program';
import { decodeBase58 } from '@/lib/base58';

const SOL_LOW_THRESHOLD = 5_000_000; // 0.005 SOL — re-seed if wallet drops below this

/**
 * Detects first-time users (no on-chain UserAccount) and:
 *  1. Calls POST /api/airdrop — admin sends 10,000 USDC + 0.01 SOL (if needed)
 *     to the user's wallet/ATA in one confirmed transaction
 *  2. For session wallets: auto-deposits the USDC into the vault so AVAIL
 *     shows $10,000 immediately (SOL for rent is already seeded by admin)
 *  3. Shows a welcome info toast with the tx link
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
      : (user?.type === 'generated' || user?.type === 'email') ? user.address : null;

  useEffect(() => {
    if (!hydrated || !signerAddress) return;
    if (triggered.current.has(signerAddress)) return;

    const sessionKey = `airdrop_checked_${signerAddress}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionKey)) return;

    triggered.current.add(signerAddress);
    let cancelled = false;

    (async () => {
      try {
        // Check UserAccount PDA existence
        const balance = await fetchUserAccountBalance(connection, new PublicKey(signerAddress));
        console.log('[AirdropSyncer] userAccountBalance:', balance, 'wallet:', signerAddress);

        if (balance !== null) {
          // Existing user — still check SOL and re-seed if below threshold so
          // transactions don't fail with "insufficient funds for rent".
          const solBalance = await connection.getBalance(new PublicKey(signerAddress)).catch(() => Infinity);
          console.log('[AirdropSyncer] existing user solBalance:', solBalance);
          if (solBalance < SOL_LOW_THRESHOLD) {
            console.log('[AirdropSyncer] SOL low — requesting re-seed...');
            const res = await fetch('/api/airdrop', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ wallet: signerAddress }),
            });
            const data = await res.json().catch(() => ({}));
            console.log('[AirdropSyncer] sol re-seed response:', data);
          }
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(sessionKey, 'existing');
          return;
        }

        console.log('[AirdropSyncer] new user detected — calling /api/airdrop');
        const res = await fetch('/api/airdrop', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ wallet: signerAddress }),
        });

        let data: { success?: boolean; tx?: string; already?: boolean; solSeeded?: boolean; error?: string; code?: string };
        try {
          data = await res.json();
        } catch {
          console.error('[AirdropSyncer] failed to parse airdrop response as JSON');
          return;
        }

        if (cancelled) return;
        console.log('[AirdropSyncer] airdrop response:', data);

        if (data.already) {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(sessionKey, 'done');
          return;
        }

        if (!data.success || !data.tx) {
          console.warn('[AirdropSyncer] airdrop failed, will retry on next page load:', data.error);
          return;
        }

        // Success — mark done
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(sessionKey, 'done');

        // Session wallet: auto-deposit into vault so AVAIL shows $10,000 immediately.
        // The admin airdrop tx already seeded SOL alongside USDC, so the session
        // wallet has enough lamports for the deposit instruction's rent.
        if (user?.type === 'generated' || user?.type === 'email') {
          const kpRaw =
            typeof localStorage !== 'undefined' ? localStorage.getItem('guest_keypair') : null;

          if (kpRaw) {
            const signer = Keypair.fromSecretKey(decodeBase58(kpRaw));
            console.log('[AirdropSyncer] session wallet — waiting for RPC propagation then depositing...');

            // Brief pause so the USDC + SOL airdrop tx is fully propagated
            await new Promise<void>(r => setTimeout(r, 2_500));
            if (cancelled) return;

            try {
              const depositSig = await sendDepositKeypair(connection, signer, 10_000);
              console.log('[AirdropSyncer] auto-deposit succeeded, tx:', depositSig);
              addInfo('Welcome to CSLIQUID! $10,000 USDC is ready to trade.', data.tx);
            } catch (depositErr) {
              console.error('[AirdropSyncer] auto-deposit failed:', depositErr);
              addInfo('$10,000 USDC airdropped to your wallet! Open the deposit modal to fund your account.', data.tx);
            }
            return;
          }
        }

        // Phantom / external wallet — USDC lands in ATA; user deposits via UI
        addInfo('$10,000 USDC airdropped! Deposit it on the trade page to start trading.', data.tx);
      } catch (err) {
        console.error('[AirdropSyncer] unexpected error:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [hydrated, signerAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
