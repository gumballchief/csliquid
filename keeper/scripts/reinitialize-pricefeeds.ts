/**
 * Transfers authority on all PriceFeed and Market accounts from the old deploy
 * keypair (A1Wxo5S5...) to the CSLQ wallet (CSLQsy314...).
 *
 * Run from the keeper/ directory AFTER the upgraded program is deployed:
 *   npx ts-node scripts/reinitialize-pricefeeds.ts
 *
 * Reads:
 *   - Old authority : ~/.config/solana/id.json  (the original deploy keypair)
 *   - New authority : C:\Users\youso\CSLQsy314KoBqbYFRdvD8grJFCKPN4myHnBp7Avo2JsG.json
 *
 * Safe to re-run — already-migrated feeds/markets are detected and skipped.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { AnchorProvider, Idl, Program } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ── Config ────────────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey('76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f');
const RPC_URL    = process.env.HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';

const CSLQ_KEYPAIR_PATH = path.join('C:', 'Users', 'youso',
  'CSLQsy314KoBqbYFRdvD8grJFCKPN4myHnBp7Avo2JsG.json');

const INDEX_IDS = [
  'awp-index',
  'ak47-index',
  'knife-index',
  'glove-index',
  'cs500-index',
] as const;

// ── Keypair helpers ───────────────────────────────────────────────────────────

function loadJsonKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ── PDA helpers ───────────────────────────────────────────────────────────────

function priceFeedPda(skinId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('price_feed'), Buffer.from(skinId)],
    PROGRAM_ID,
  );
  return pda;
}

function marketPda(priceFeed: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('market'), priceFeed.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

// ── Anchor provider factory ───────────────────────────────────────────────────

function makeProvider(connection: Connection, signer: Keypair): AnchorProvider {
  const wallet = {
    publicKey: signer.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (tx instanceof Transaction) tx.partialSign(signer);
      else (tx as VersionedTransaction).sign([signer]);
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      for (const tx of txs) {
        if (tx instanceof Transaction) tx.partialSign(signer);
        else (tx as VersionedTransaction).sign([signer]);
      }
      return txs;
    },
  };
  return new AnchorProvider(connection, wallet as any, {
    commitment:          'confirmed',
    preflightCommitment: 'confirmed',
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load keypairs
  const oldKeypair  = loadJsonKeypair(path.join(os.homedir(), '.config', 'solana', 'id.json'));
  const cslqKeypair = loadJsonKeypair(CSLQ_KEYPAIR_PATH);

  console.log(`Old authority  : ${oldKeypair.publicKey.toBase58()}`);
  console.log(`New authority  : ${cslqKeypair.publicKey.toBase58()}`);
  console.log('');

  if (!cslqKeypair.publicKey.toBase58().startsWith('CSLQ')) {
    console.error('CSLQ keypair pubkey does not start with CSLQ — wrong file?');
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, 'confirmed');

  // Program signed by the OLD authority (needed to call set_*_authority)
  const idlPath   = path.join(__dirname, '../idl/cs_skin_futures.json');
  const idl       = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as Idl;
  const oldProgram = new Program(idl, makeProvider(connection, oldKeypair));

  console.log('── Migrating PriceFeed authorities ──────────────────────────────────────');

  for (const indexId of INDEX_IDS) {
    const feedPda = priceFeedPda(indexId);

    // Read current authority from on-chain account
    let currentAuthority: PublicKey;
    try {
      const feedAccount = await (oldProgram.account as any).priceFeed.fetch(feedPda);
      currentAuthority  = feedAccount.authority as PublicKey;
    } catch {
      console.log(`[SKIP] PriceFeed ${indexId.padEnd(12)} — account not found`);
      continue;
    }

    if (currentAuthority.equals(cslqKeypair.publicKey)) {
      console.log(`[SKIP] PriceFeed ${indexId.padEnd(12)} ${feedPda.toBase58()} — already CSLQ`);
      continue;
    }

    if (!currentAuthority.equals(oldKeypair.publicKey)) {
      console.warn(`[WARN] PriceFeed ${indexId.padEnd(12)} authority is ${currentAuthority.toBase58()} — not the old keypair, skipping`);
      continue;
    }

    try {
      await (oldProgram.methods as any)
        .setPriceFeedAuthority(cslqKeypair.publicKey)
        .accounts({
          authority: oldKeypair.publicKey,
          priceFeed: feedPda,
        })
        .rpc();
      console.log(`[ OK ] PriceFeed ${indexId.padEnd(12)} ${feedPda.toBase58()} → CSLQ`);
    } catch (err) {
      console.error(`[FAIL] PriceFeed ${indexId}:`, err);
    }
  }

  console.log('');
  console.log('── Migrating Market authorities ─────────────────────────────────────────');

  for (const indexId of INDEX_IDS) {
    const feedPda = priceFeedPda(indexId);
    const mktPda  = marketPda(feedPda);

    let currentAuthority: PublicKey;
    try {
      const mktAccount  = await (oldProgram.account as any).market.fetch(mktPda);
      currentAuthority  = mktAccount.authority as PublicKey;
    } catch {
      console.log(`[SKIP] Market     ${indexId.padEnd(12)} — account not found`);
      continue;
    }

    if (currentAuthority.equals(cslqKeypair.publicKey)) {
      console.log(`[SKIP] Market     ${indexId.padEnd(12)} ${mktPda.toBase58()} — already CSLQ`);
      continue;
    }

    if (!currentAuthority.equals(oldKeypair.publicKey)) {
      console.warn(`[WARN] Market     ${indexId.padEnd(12)} authority is ${currentAuthority.toBase58()} — not the old keypair, skipping`);
      continue;
    }

    try {
      await (oldProgram.methods as any)
        .setMarketAuthority(cslqKeypair.publicKey)
        .accounts({
          authority: oldKeypair.publicKey,
          market:    mktPda,
        })
        .rpc();
      console.log(`[ OK ] Market     ${indexId.padEnd(12)} ${mktPda.toBase58()} → CSLQ`);
    } catch (err) {
      console.error(`[FAIL] Market ${indexId}:`, err);
    }
  }

  console.log('');
  console.log('── CSLQ keypair for server ADMIN_KEYPAIR ────────────────────────────────');
  console.log('');
  console.log(bs58.encode(cslqKeypair.secretKey));
  console.log('');
  console.log('Set this as ADMIN_KEYPAIR in ecosystem.config.js on the server.');
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
