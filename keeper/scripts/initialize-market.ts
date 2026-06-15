/**
 * One-time setup: initialize PriceFeed + Market accounts for every index.
 *
 * Run from the keeper/ directory:
 *   npx ts-node scripts/initialize-market.ts
 *
 * Reads the local Solana keypair from ~/.config/solana/id.json and checks
 * that it matches the ADMIN_KEYPAIR env var used by the keeper on the server.
 * If they differ, the script prints a warning so you can update the server env.
 *
 * Safe to re-run: existing accounts are detected via getAccountInfo and skipped.
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

const PROGRAM_ID  = new PublicKey('76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f');
const RPC_URL     = process.env.HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';

const INDEX_IDS = [
  'awp-index',
  'ak47-index',
  'knife-index',
  'glove-index',
  'cs500-index',
] as const;

// ── Keypair loading ───────────────────────────────────────────────────────────

function loadLocalKeypair(): Keypair {
  const kpPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  if (!fs.existsSync(kpPath)) {
    console.error(`Keypair file not found: ${kpPath}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(kpPath, 'utf-8')) as number[];
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const adminKeypair = loadLocalKeypair();
  console.log(`\nLocal keypair pubkey : ${adminKeypair.publicKey.toBase58()}`);

  // ── Keypair mismatch check ────────────────────────────────────────────────
  const envKpB58 = process.env.ADMIN_KEYPAIR;
  if (envKpB58) {
    try {
      const envKp = Keypair.fromSecretKey(bs58.decode(envKpB58));
      if (envKp.publicKey.equals(adminKeypair.publicKey)) {
        console.log('ADMIN_KEYPAIR env var : matches local keypair ✓');
      } else {
        console.log(`ADMIN_KEYPAIR env var : ${envKp.publicKey.toBase58()}`);
        console.log('');
        console.log('⚠️  MISMATCH — server ADMIN_KEYPAIR is a different keypair from the local file.');
        console.log('   The PriceFeed authority will be set to the LOCAL keypair (the deploy keypair).');
        console.log('   Update the server ADMIN_KEYPAIR env var to the base58 value below:');
        console.log('');
        console.log(`   ${bs58.encode(adminKeypair.secretKey)}`);
        console.log('');
        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve =>
          rl.question('Continue with the local keypair? [y/N] ', resolve),
        );
        rl.close();
        if (answer.trim().toLowerCase() !== 'y') {
          console.log('Aborted.');
          process.exit(0);
        }
      }
    } catch {
      console.warn('Could not parse ADMIN_KEYPAIR env var — proceeding with local keypair.');
    }
  } else {
    console.log('ADMIN_KEYPAIR env var : not set (skipping mismatch check)');
  }

  // ── Anchor setup ──────────────────────────────────────────────────────────
  const connection = new Connection(RPC_URL, 'confirmed');

  const wallet = {
    publicKey: adminKeypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (tx instanceof Transaction) tx.partialSign(adminKeypair);
      else (tx as VersionedTransaction).sign([adminKeypair]);
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      for (const tx of txs) {
        if (tx instanceof Transaction) tx.partialSign(adminKeypair);
        else (tx as VersionedTransaction).sign([adminKeypair]);
      }
      return txs;
    },
  };

  const provider = new AnchorProvider(connection, wallet as any, {
    commitment:          'confirmed',
    preflightCommitment: 'confirmed',
  });

  const idlPath = path.join(__dirname, '../idl/cs_skin_futures.json');
  const idl     = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as Idl;
  const program = new Program(idl, provider);

  // ── PriceFeed + Market per index ──────────────────────────────────────────
  console.log('\n── Initializing PriceFeeds + Markets ────────────────────────────────────');

  for (const indexId of INDEX_IDS) {
    const feedPda   = priceFeedPda(indexId);
    const mktPda    = marketPda(feedPda);

    // PriceFeed
    const feedInfo = await connection.getAccountInfo(feedPda);
    if (feedInfo !== null) {
      console.log(`[SKIP] PriceFeed  ${indexId.padEnd(12)} ${feedPda.toBase58()} (already exists)`);
    } else {
      try {
        await (program.methods as any)
          .initializePriceFeed(indexId)
          .accounts({
            authority:     adminKeypair.publicKey,
            priceFeed:     feedPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log(`[ OK ] PriceFeed  ${indexId.padEnd(12)} ${feedPda.toBase58()}`);
      } catch (err) {
        console.error(`[FAIL] PriceFeed  ${indexId}:`, err);
        continue;
      }
    }

    // Market (seeded by the PriceFeed pubkey)
    const mktInfo = await connection.getAccountInfo(mktPda);
    if (mktInfo !== null) {
      console.log(`[SKIP] Market     ${indexId.padEnd(12)} ${mktPda.toBase58()} (already exists)`);
    } else {
      try {
        await (program.methods as any)
          .initializeMarket({ skinId: indexId, priceFeed: feedPda })
          .accounts({
            authority:     adminKeypair.publicKey,
            market:        mktPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log(`[ OK ] Market     ${indexId.padEnd(12)} ${mktPda.toBase58()}`);
      } catch (err) {
        console.error(`[FAIL] Market     ${indexId}:`, err);
      }
    }
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
