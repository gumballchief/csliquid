export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { decodeBase58 } from '@/lib/base58';

// ── SPL constants (no @solana/spl-token dependency) ──────────────────────────

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROG = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const USDC_MINT        = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

const AIRDROP_AMOUNT   = BigInt(10_000_000_000); // 10,000 USDC (6 decimals)
// Seed enough SOL to cover UserAccount PDA rent (~0.005 SOL) + tx fees.
// Sent only when the user's wallet has < SOL_MIN_THRESHOLD to avoid waste.
const SOL_SEED_LAMPORTS  = 10_000_000;  // 0.01 SOL
const SOL_MIN_THRESHOLD  = 5_000_000;   // 0.005 SOL — below this we seed

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  'https://devnet.helius-rpc.com/?api-key=f6fe2699-bbfb-4999-b2e5-e58ebd674f2e';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAta(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROG,
  )[0];
}

function createAtaIdempotentIx(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOC_TOKEN_PROG,
    keys: [
      { pubkey: payer,                   isSigner: true,  isWritable: true  },
      { pubkey: getAta(owner, mint),     isSigner: false, isWritable: true  },
      { pubkey: owner,                   isSigner: false, isWritable: false },
      { pubkey: mint,                    isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function transferIx(
  source: PublicKey,
  dest: PublicKey,
  authority: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0);
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source,    isSigner: false, isWritable: true  },
      { pubkey: dest,      isSigner: false, isWritable: true  },
      { pubkey: authority, isSigner: true,  isWritable: false },
    ],
    data,
  });
}

function kvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { wallet?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wallet } = body;
  if (!wallet || typeof wallet !== 'string') {
    return NextResponse.json({ error: 'wallet required' }, { status: 400 });
  }

  let userPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    // Check USDC-airdrop status — but always still check SOL balance below.
    let alreadyAirdroppedUsdc = false;
    if (kvAvailable()) {
      const existing = await kv.get(`airdropped:${wallet}`);
      alreadyAirdroppedUsdc = !!existing;
    }

    const adminKeyRaw = process.env.ADMIN_KEYPAIR_BASE58;
    if (!adminKeyRaw) {
      return NextResponse.json(
        { error: 'Admin keypair not configured', code: 'NO_KEYPAIR' },
        { status: 503 },
      );
    }

    let admin: Keypair;
    try {
      admin = Keypair.fromSecretKey(decodeBase58(adminKeyRaw));
    } catch {
      return NextResponse.json(
        { error: 'Invalid admin keypair', code: 'NO_KEYPAIR' },
        { status: 503 },
      );
    }

    const connection = new Connection(RPC_URL, 'confirmed');
    const adminAta   = getAta(admin.publicKey, USDC_MINT);
    const userAta    = getAta(userPubkey, USDC_MINT);

    // Always check SOL balance — re-seed if below threshold even for returning users
    // whose SOL was spent on prior transactions.
    const userSolBal = await connection.getBalance(userPubkey).catch(() => 0);
    const needsSol   = userSolBal < SOL_MIN_THRESHOLD;

    // Check on-chain USDC balance — devnet resets wipe the ATA so we must
    // re-send USDC even when KV says the user was already airdropped.
    const userUsdcBal = await (async () => {
      try {
        const info = await connection.getTokenAccountBalance(userAta);
        return info.value.uiAmount ?? 0;
      } catch {
        return 0; // ATA doesn't exist → treat as 0
      }
    })();
    const needsUsdc = userUsdcBal === 0;
    console.log(`[airdrop] wallet=${wallet} solBal=${userSolBal} usdcBal=${userUsdcBal} needsSol=${needsSol} needsUsdc=${needsUsdc} alreadyKv=${alreadyAirdroppedUsdc}`);

    // Nothing to do — already has USDC in wallet and enough SOL.
    if (!needsUsdc && !needsSol) {
      return NextResponse.json({ already: true });
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: admin.publicKey });

    // Seed SOL first (must be before USDC so account exists for ATA creation)
    if (needsSol) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey:   userPubkey,
          lamports:   SOL_SEED_LAMPORTS,
        })
      );
    }

    // Send USDC when on-chain balance is 0 (first visit or devnet reset).
    if (needsUsdc) {
      tx.add(createAtaIdempotentIx(admin.publicKey, userPubkey, USDC_MINT));
      tx.add(transferIx(adminAta, userAta, admin.publicKey, AIRDROP_AMOUNT));
    }
    tx.sign(admin);

    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });

    // Race confirmation against a 25-second timeout — devnet can be slow.
    // If we timeout the tx is still in-flight; we return success so the client
    // doesn't retry and double-send. The KV record is written below regardless.
    await Promise.race([
      connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('confirm_timeout')), 25_000)),
    ]).catch((e: Error) => {
      if (e.message !== 'confirm_timeout') throw e;
      console.warn(`[airdrop] confirmation timed out — tx ${sig} still in flight`);
    });

    console.log(`[airdrop] done tx=${sig} solSeeded=${needsSol} usdcSent=${needsUsdc}`);

    // Record USDC airdrop in KV — note this is now a fallback hint only;
    // the real gate is the on-chain USDC balance check above.
    if (needsUsdc && kvAvailable()) {
      await kv.set(`airdropped:${wallet}`, { ts: Date.now(), tx: sig });
    }

    return NextResponse.json({ success: true, tx: sig, solSeeded: needsSol });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[airdrop] error:', msg);
    return NextResponse.json({ error: msg, code: 'AIRDROP_FAILED' }, { status: 500 });
  }
}
