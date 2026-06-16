export const dynamic = 'force-dynamic';

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

const AIRDROP_AMOUNT = BigInt(10_000_000_000); // 10,000 USDC at 6 decimal places

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

/** Associated Token Program instruction 1 = create_associated_token_account_idempotent */
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

/** SPL Token instruction 3 = Transfer */
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

  // One airdrop per wallet — check KV first
  if (kvAvailable()) {
    const existing = await kv.get(`airdropped:${wallet}`);
    if (existing) return NextResponse.json({ already: true });
  }

  // Load admin keypair from env
  const adminKeyRaw = process.env.ADMIN_KEYPAIR_BASE58;
  if (!adminKeyRaw) {
    return NextResponse.json({ error: 'Airdrop not configured' }, { status: 503 });
  }
  let admin: Keypair;
  try {
    admin = Keypair.fromSecretKey(decodeBase58(adminKeyRaw));
  } catch {
    return NextResponse.json({ error: 'Invalid admin keypair' }, { status: 503 });
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  const adminAta = getAta(admin.publicKey, USDC_MINT);
  const userAta  = getAta(userPubkey, USDC_MINT);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: admin.publicKey });
  tx.add(createAtaIdempotentIx(admin.publicKey, userPubkey, USDC_MINT));
  tx.add(transferIx(adminAta, userAta, admin.publicKey, AIRDROP_AMOUNT));
  tx.sign(admin);

  let sig: string;
  try {
    sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Record in KV so we don't double-airdrop
  if (kvAvailable()) {
    await kv.set(`airdropped:${wallet}`, { ts: Date.now(), tx: sig });
  }

  return NextResponse.json({ success: true, tx: sig });
}
