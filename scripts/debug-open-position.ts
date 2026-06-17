/**
 * debug-open-position.ts
 *
 * Simulates the combined withdraw + open_position transaction that the
 * frontend now sends.  Running open_position alone always fails because
 * the wallet ATA is empty; the withdraw pre-funds it from the vault.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/debug-open-position.ts
 */

import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import IDL from '../src/lib/idl/cs_skin_futures.json';

// ── Params ───────────────────────────────────────────────────────────────────

const RPC          = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH   ?? path.join(os.homedir(), '.config', 'solana', 'id.json');

const PROGRAM_ID   = new PublicKey('76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f');
const USDC_MINT    = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
const TOKEN_PROG   = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATP          = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const OWNER        = new PublicKey('CSLQsy314KoBqbYFRdvD8grJFCKPN4myHnBp7Avo2JsG');

const INDEX_ID     = 'awp-index';
const COLLATERAL   = 100;          // USDC
const LEVERAGE     = 5;
const IS_LONG      = true;
const TAKER_FEE    = COLLATERAL * LEVERAGE * 0.002;   // 1.00 USDC
const WITHDRAW_AMT = COLLATERAL + TAKER_FEE;          // 101.00 USDC

// ── Helpers ──────────────────────────────────────────────────────────────────

function pda(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}
function ata(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROG.toBuffer(), USDC_MINT.toBuffer()], ATP,
  )[0];
}
function toUi(raw: bigint): string { return (Number(raw) / 1e6).toFixed(6); }

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const conn   = new Connection(RPC, 'confirmed');
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8')));
  const payer  = Keypair.fromSecretKey(secret);

  const wallet   = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program  = new anchor.Program(IDL as unknown as anchor.Idl, provider);

  // ── Derive PDAs ──────────────────────────────────────────────────────────
  const priceFeed    = pda([Buffer.from('price_feed'), Buffer.from(INDEX_ID)]);
  const market       = pda([Buffer.from('market'), priceFeed.toBuffer()]);
  const position     = pda([Buffer.from('position'), OWNER.toBuffer(), market.toBuffer()]);
  const userAccount  = pda([Buffer.from('user_account'), OWNER.toBuffer()]);
  const userUsdc     = ata(OWNER);
  const vaultToken   = pda([Buffer.from('vault'), USDC_MINT.toBuffer()]);
  const vaultData    = pda([Buffer.from('vault')]);
  const vaultAuth    = pda([Buffer.from('vault_authority')]);
  const liquidityPool = pda([Buffer.from('liquidity_pool')]);

  // ── Account state ────────────────────────────────────────────────────────
  console.log('=== On-chain state ===');
  const keys  = [priceFeed, market, position, userAccount, userUsdc, vaultToken, vaultData, vaultAuth, liquidityPool];
  const names = ['price_feed','market','position','user_account','user_usdc','vault_token','vault_data','vault_auth','liq_pool'];
  const infos = await conn.getMultipleAccountsInfo(keys);

  infos.forEach((info, i) => {
    if (!info) { console.log(`${names[i].padEnd(14)}: MISSING`); return; }
    let extra = '';
    if (names[i] === 'price_feed') {
      const price = info.data.readBigUInt64LE(40);
      const ts    = info.data.readBigInt64LE(48);
      extra = `  price=$${(Number(price)/1e6).toFixed(2)}  age=${Math.floor(Date.now()/1000)-Number(ts)}s`;
    } else if (names[i] === 'user_account') {
      extra = `  usdc_balance=${toUi(info.data.readBigUInt64LE(40))}`;
    } else if (names[i] === 'user_usdc' || names[i] === 'vault_token') {
      extra = `  balance=${toUi(info.data.readBigUInt64LE(64))} USDC`;
    }
    console.log(`${names[i].padEnd(14)}: EXISTS len=${info.data.length}${extra}`);
  });

  // ── Build combined transaction ────────────────────────────────────────────
  console.log(`\n=== Building withdraw(${WITHDRAW_AMT}) + open_position(${COLLATERAL}) ===`);

  const withdrawLamports   = new anchor.BN(Math.round(WITHDRAW_AMT * 1_000_000));
  const collateralLamports = new anchor.BN(Math.round(COLLATERAL   * 1_000_000));
  const maxEntryPrice      = new anchor.BN('18446744073709551615'); // u64::MAX

  let tx: Transaction;
  try {
    const withdrawIx = await program.methods
      .withdraw(withdrawLamports)
      .accounts({
        owner:                  OWNER,
        userAccount,
        userUsdcAccount:        userUsdc,
        vaultToken,
        vaultData,
        vaultAuthority:         vaultAuth,
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROG,
        associatedTokenProgram: ATP,
        systemProgram:          SystemProgram.programId,
      })
      .instruction();

    const openIx = await program.methods
      .openPosition({ isLong: IS_LONG, collateral: collateralLamports, leverage: LEVERAGE, maxEntryPrice })
      .accounts({
        owner:                  OWNER,
        userAccount,
        userUsdcAccount:        userUsdc,
        market,
        position,
        vaultToken,
        vaultData,
        priceFeed,
        liquidityPool,
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROG,
        associatedTokenProgram: ATP,
        systemProgram:          SystemProgram.programId,
      })
      .instruction();

    tx = new Transaction().add(withdrawIx, openIx);
  } catch (err: unknown) {
    console.error('Failed to build:', (err as Error).message);
    process.exit(1);
  }

  tx.feePayer = OWNER;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

  // ── Simulate ──────────────────────────────────────────────────────────────
  console.log('\n=== Simulation result ===');
  const result = await conn.simulateTransaction(tx, undefined, undefined);

  console.log('err:', JSON.stringify(result.value.err));
  console.log('logs:');
  (result.value.logs ?? []).forEach(l => console.log(' ', l));

  if (!result.value.err) {
    console.log('\n✓ Simulation PASSED — combined tx would succeed.');
  } else {
    console.log('\n✗ Simulation FAILED.');
  }

  // ── Also simulate open_position alone to confirm the baseline failure ─────
  console.log('\n=== Baseline: open_position alone (expected to fail) ===');
  let txAlone: Transaction;
  try {
    txAlone = await program.methods
      .openPosition({ isLong: IS_LONG, collateral: collateralLamports, leverage: LEVERAGE, maxEntryPrice })
      .accounts({
        owner:                  OWNER,
        userAccount,
        userUsdcAccount:        userUsdc,
        market,
        position,
        vaultToken,
        vaultData,
        priceFeed,
        liquidityPool,
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROG,
        associatedTokenProgram: ATP,
        systemProgram:          SystemProgram.programId,
      })
      .transaction();
    txAlone.feePayer = OWNER;
    txAlone.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    const r2 = await conn.simulateTransaction(txAlone, undefined, undefined);
    console.log('err:', JSON.stringify(r2.value.err));
    (r2.value.logs ?? []).forEach(l => console.log(' ', l));
  } catch (e) {
    console.error('Build failed:', (e as Error).message);
  }
}

main().catch(err => {
  console.error('\n[fatal]', err?.message ?? err);
  process.exit(1);
});
