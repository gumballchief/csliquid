/**
 * topup-admin-usdc.ts — Top up the admin wallet's USDC balance by calling
 * the spl-token-faucet program (4sN8PnN2ki2W4TFXAfzR645FWs8nimmsYeNtxM8RBK6A)
 * directly on-chain, bypassing the broken spl-token-faucet.com HTTP API.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/topup-admin-usdc.ts
 */

import * as crypto from 'crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

// ── Config ────────────────────────────────────────────────────────────────────

const ADMIN_KEYPAIR_B58 = process.env.ADMIN_KEYPAIR_BASE58 ??
  '4tBrDaonWxNFUzZgGAPn8ipUzAHGpBa3iZ9NtxRPV4ADaLe6iY5ULR6dJ5cfag8NF9DEZfYx4YvVwub2q9UCm8N2';

const FAUCET_PROGRAM = new PublicKey('4sN8PnN2ki2W4TFXAfzR645FWs8nimmsYeNtxM8RBK6A');
const USDC_MINT      = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
const TOKEN_PROG     = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_PROG     = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const RPC_URL        = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

const TOPUP_AMOUNT = BigInt(100_000_000_000); // 100,000 USDC (6 decimals)
const MIN_BALANCE  = 50_000;                   // only top up if below this

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeBase58(str: string): Uint8Array {
  const CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  const bytes = [0];
  for (const c of str.slice(zeros)) {
    const val = CHARS.indexOf(c);
    if (val < 0) throw new Error(`Invalid base58 character: ${c}`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

function getAta(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()],
    ASSOC_PROG,
  )[0];
}

async function getUsdcBalance(connection: Connection, ata: PublicKey): Promise<number> {
  try {
    const info = await connection.getTokenAccountBalance(ata);
    return info.value.uiAmount ?? 0;
  } catch {
    return 0;
  }
}

// Anchor instruction discriminator = sha256("global:<name>")[0:8]
function anchorDisc(name: string): Buffer {
  return Buffer.from(crypto.createHash('sha256').update(`global:${name}`).digest()).slice(0, 8);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const admin    = Keypair.fromSecretKey(decodeBase58(ADMIN_KEYPAIR_B58));
  const adminAta = getAta(admin.publicKey, USDC_MINT);
  const conn     = new Connection(RPC_URL, 'confirmed');

  console.log('=== CSLIQUID Admin USDC Top-up ===');
  console.log(`Admin:     ${admin.publicKey.toBase58()}`);
  console.log(`Admin ATA: ${adminAta.toBase58()}`);

  // Verify the mint is the expected PDA of the faucet program
  const [mintPda, mintBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('faucet-mint')],
    FAUCET_PROGRAM,
  );
  if (!mintPda.equals(USDC_MINT)) {
    throw new Error(
      `Mint PDA mismatch!\n  expected: ${USDC_MINT.toBase58()}\n  derived:  ${mintPda.toBase58()}\n` +
      `The faucet program or PDA seeds may have changed.`,
    );
  }
  console.log(`Mint PDA verified (bump ${mintBump})\n`);

  const currentBalance = await getUsdcBalance(conn, adminAta);
  console.log(`Current USDC balance: ${currentBalance.toLocaleString()} USDC`);

  if (currentBalance >= MIN_BALANCE) {
    console.log(`Balance ≥ ${MIN_BALANCE.toLocaleString()} USDC — no top-up needed.`);
    return;
  }

  console.log(`Minting ${Number(TOPUP_AMOUNT) / 1e6} USDC via faucet program…`);

  const SYSTEM_PROG  = new PublicKey('11111111111111111111111111111111');
  const ASSOC_TOKEN  = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const RENT_SYSVAR  = new PublicKey('SysvarRent111111111111111111111111111111111');

  // Build airdrop instruction (Anchor discriminator + mint_bump u8 + amount u64)
  // Account order from the Airdrop<'info> struct:
  //   0: mint            (writable)
  //   1: destination ATA (writable, init_if_needed)
  //   2: payer           (signer, writable)
  //   3: receiver        (wallet that owns the ATA)
  //   4: system_program
  //   5: token_program
  //   6: associated_token_program
  //   7: rent
  const data = Buffer.alloc(17); // 8 disc + 1 bump + 8 amount
  anchorDisc('airdrop').copy(data, 0);
  data.writeUInt8(mintBump, 8);
  data.writeBigUInt64LE(TOPUP_AMOUNT, 9);

  const ix = new TransactionInstruction({
    programId: FAUCET_PROGRAM,
    keys: [
      { pubkey: USDC_MINT,            isSigner: false, isWritable: true  }, // mint
      { pubkey: adminAta,             isSigner: false, isWritable: true  }, // destination ATA
      { pubkey: admin.publicKey,      isSigner: true,  isWritable: true  }, // payer
      { pubkey: admin.publicKey,      isSigner: false, isWritable: false }, // receiver
      { pubkey: SYSTEM_PROG,          isSigner: false, isWritable: false }, // system_program
      { pubkey: TOKEN_PROG,           isSigner: false, isWritable: false }, // token_program
      { pubkey: ASSOC_TOKEN,          isSigner: false, isWritable: false }, // associated_token_program
      { pubkey: RENT_SYSVAR,          isSigner: false, isWritable: false }, // rent
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: admin.publicKey }).add(ix);
  tx.sign(admin);

  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log(`Tx sent: ${sig}`);

  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log('Confirmed!');

  await new Promise(r => setTimeout(r, 2_000));
  const newBalance = await getUsdcBalance(conn, adminAta);
  console.log(`\nNew USDC balance: ${newBalance.toLocaleString()} USDC`);
  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('[fatal]', err?.message ?? err);
  if (err?.logs) (err.logs as string[]).forEach(l => console.error('  ', l));
  process.exit(1);
});
