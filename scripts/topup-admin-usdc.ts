/**
 * topup-admin-usdc.ts — Top up the admin wallet's USDC balance via spl-token-faucet.com.
 *
 * Reads ADMIN_KEYPAIR_BASE58 from environment (or pass via CLI env var).
 *
 * Usage:
 *   ADMIN_KEYPAIR_BASE58=<base58> npx ts-node --project scripts/tsconfig.json scripts/topup-admin-usdc.ts
 */

import * as https from 'https';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

// ── Config ────────────────────────────────────────────────────────────────────

const ADMIN_KEYPAIR_B58 = process.env.ADMIN_KEYPAIR_BASE58 ??
  '4tBrDaonWxNFUzZgGAPn8ipUzAHGpBa3iZ9NtxRPV4ADaLe6iY5ULR6dJ5cfag8NF9DEZfYx4YvVwub2q9UCm8N2';

const USDC_MINT   = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
const TOKEN_PROG  = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOC_PROG  = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const RPC_URL     = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

// Amount to request from faucet (in USDC UI units)
const TOPUP_AMOUNT = 100_000; // 100,000 USDC

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

function httpsGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    }).on('error', reject);
  });
}

function getAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const TOKEN  = new PublicKey(TOKEN_PROG);
  const ASSOC  = new PublicKey(ASSOC_PROG);
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()],
    ASSOC,
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const admin = Keypair.fromSecretKey(decodeBase58(ADMIN_KEYPAIR_B58));
  const adminAddress = admin.publicKey.toBase58();
  const adminAta = getAta(admin.publicKey, new PublicKey(USDC_MINT));

  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('=== CSLIQUID Admin USDC Top-up ===');
  console.log(`Admin:      ${adminAddress}`);
  console.log(`Admin ATA:  ${adminAta.toBase58()}`);

  const currentBalance = await getUsdcBalance(connection, adminAta);
  console.log(`Current USDC balance: ${currentBalance.toLocaleString()} USDC\n`);

  if (currentBalance >= 50_000) {
    console.log('Balance is sufficient (≥ 50,000 USDC). No top-up needed.');
    return;
  }

  console.log(`Requesting ${TOPUP_AMOUNT.toLocaleString()} USDC from spl-token-faucet.com…`);

  // Try spl-token-faucet.com API
  const faucetUrl =
    `https://spl-token-faucet.com/api/get-tokens` +
    `?network=devnet` +
    `&address=${adminAddress}` +
    `&token=USDC` +
    `&amount=${TOPUP_AMOUNT}`;

  try {
    const { status, body } = await httpsGet(faucetUrl);
    console.log(`Faucet response (HTTP ${status}):`, body.slice(0, 500));

    if (status >= 200 && status < 300) {
      console.log('\nWaiting 5s for confirmation…');
      await new Promise(r => setTimeout(r, 5_000));
      const newBalance = await getUsdcBalance(connection, adminAta);
      console.log(`New USDC balance: ${newBalance.toLocaleString()} USDC`);
    } else {
      console.error('\nFaucet returned non-2xx. Try visiting manually:');
      console.error(`  https://spl-token-faucet.com/?network=devnet`);
      console.error(`  Connect wallet: ${adminAddress}`);
    }
  } catch (err) {
    console.error('Faucet request failed:', err);
    console.error('\nManual top-up options:');
    console.error('  1. Visit https://spl-token-faucet.com/?network=devnet');
    console.error(`     Paste admin address: ${adminAddress}`);
    console.error('  2. Or use Solana devnet SPL-token CLI:');
    console.error(`     spl-token mint ${USDC_MINT} ${TOPUP_AMOUNT} ${adminAta.toBase58()}`);
    console.error('     (requires mint authority access)');
  }
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
