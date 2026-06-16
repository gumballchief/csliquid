/**
 * push-prices.ts — Trusted price pusher for cs-skin-futures.
 *
 * Reads VWAP prices from the oracle service (CSFloat + Skinport), signs each
 * price with the admin keypair, and writes it to the on-chain PriceFeed
 * account every 60 seconds.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/push-prices.ts
 *
 * Environment variables (all optional):
 *   ORACLE_URL          Oracle service base URL  (default: http://localhost:3001)
 *   SOLANA_RPC_URL      Devnet RPC endpoint       (default: https://api.devnet.solana.com)
 *   KEYPAIR_PATH        Path to admin keypair JSON (default: ~/.config/solana/id.json)
 *   PUSH_INTERVAL_MS    Push interval in ms        (default: 60000)
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

import IDL from "../src/lib/idl/cs_skin_futures.json";

// ── Config ─────────────────────────────────────────────────────────────────

const ORACLE_URL        = process.env.ORACLE_URL        ?? "http://localhost:3001";
const SOLANA_RPC_URL    = process.env.SOLANA_RPC_URL    ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH      = process.env.KEYPAIR_PATH      ?? path.join(os.homedir(), ".config", "solana", "id.json");
const PUSH_INTERVAL_MS  = Number(process.env.PUSH_INTERVAL_MS ?? 60_000);

const PROGRAM_ID = new PublicKey("76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f");

/**
 * Maps oracle-service index ID (what the HTTP oracle API accepts) to the
 * on-chain PriceFeed seed (what findProgramAddressSync uses for the PDA).
 *
 * The PriceFeed PDAs were created with the short 'AWP' / 'AK47' seeds by
 * init-awp-market.ts and init-remaining-markets.ts.  The oracle service still
 * uses the longer 'awp-index' keys internally — so we translate here.
 */
const INDEX_MAPPING = [
  { oracleId: "awp-index",   chainId: "AWP"   },
  { oracleId: "ak47-index",  chainId: "AK47"  },
  { oracleId: "knife-index", chainId: "KNIFE" },
  { oracleId: "glove-index", chainId: "GLOVE" },
  { oracleId: "cs500-index", chainId: "CS500" },
] as const;

type IndexEntry = (typeof INDEX_MAPPING)[number];

// ── Helpers ────────────────────────────────────────────────────────────────

function loadKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf8");
  const bytes = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(bytes);
}

/** Derive the PriceFeed PDA for a given index ID. */
function priceFeedPda(indexId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("price_feed"), Buffer.from(indexId)],
    PROGRAM_ID,
  );
  return pda;
}

interface OracleResponse {
  indexId:  string;
  price:    number;
  volume:   number;
  source:   string;
  fetchedAt: number;
}

async function fetchOraclePrice(indexId: string): Promise<number> {
  const res = await fetch(`${ORACLE_URL}/api/price/${encodeURIComponent(indexId)}`);
  if (!res.ok) {
    throw new Error(`Oracle returned HTTP ${res.status} for ${indexId}`);
  }
  const data = await res.json() as OracleResponse;
  if (!data.price || data.price <= 0) {
    throw new Error(`Oracle returned invalid price for ${indexId}: ${data.price}`);
  }
  return data.price;
}

/** Convert a USD float to a 6-decimal u64 (1.00 → 1_000_000). */
function toSixDecimals(priceUsd: number): anchor.BN {
  return new anchor.BN(Math.round(priceUsd * 1_000_000));
}

// ── Anchor setup ────────────────────────────────────────────────────────────

function buildProgram(admin: Keypair): anchor.Program {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const wallet     = new anchor.Wallet(admin);
  const provider   = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  return new anchor.Program(IDL as unknown as anchor.Idl, provider);
}

// ── PriceFeed initialisation ─────────────────────────────────────────────────

async function ensurePriceFeedExists(
  program: anchor.Program,
  admin:   Keypair,
  entry:   IndexEntry,
): Promise<void> {
  const feedPda = priceFeedPda(entry.chainId);
  const info    = await program.provider.connection.getAccountInfo(feedPda);

  if (info) {
    return; // already initialised
  }

  console.log(`[init] Creating PriceFeed for ${entry.chainId} at ${feedPda.toBase58()} ...`);
  await program.methods
    .initializePriceFeed(entry.chainId)
    .accounts({
      authority:     admin.publicKey,
      priceFeed:     feedPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();

  console.log(`[init] PriceFeed created for ${entry.chainId}`);
}

// ── Price push ─────────────────────────────────────────────────────────────

async function pushPrice(
  program: anchor.Program,
  admin:   Keypair,
  entry:   IndexEntry,
): Promise<void> {
  // Fetch price from oracle using the oracle's internal ID ('awp-index' format).
  // Push to the on-chain PriceFeed PDA using the short chain ID ('AWP' format),
  // which matches what the frontend derives via findPriceFeedPda('AWP').
  const priceUsd = await fetchOraclePrice(entry.oracleId);
  const priceBN  = toSixDecimals(priceUsd);
  const feedPda  = priceFeedPda(entry.chainId);

  await program.methods
    .pushPrice({ price: priceBN })
    .accounts({
      authority: admin.publicKey,
      priceFeed: feedPda,
    })
    .signers([admin])
    .rpc();

  console.log(
    `[push] ${entry.chainId.padEnd(7)} $${priceUsd.toFixed(2).padStart(10)}` +
    `  (u64=${priceBN.toString()})  feed=${feedPda.toBase58().slice(0, 8)}…`,
  );
}

// ── Main loop ──────────────────────────────────────────────────────────────

async function runCycle(program: anchor.Program, admin: Keypair): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`\n[cycle] ${ts}`);

  const results = await Promise.allSettled(
    INDEX_MAPPING.map(entry => pushPrice(program, admin, entry)),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      console.error(`[error] ${INDEX_MAPPING[i].chainId}: ${(r.reason as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("=== cs-skin-futures price pusher ===");
  console.log(`Oracle:    ${ORACLE_URL}`);
  console.log(`RPC:       ${SOLANA_RPC_URL}`);
  console.log(`Interval:  ${PUSH_INTERVAL_MS / 1000}s`);

  const admin   = loadKeypair(KEYPAIR_PATH);
  const program = buildProgram(admin);

  console.log(`Authority: ${admin.publicKey.toBase58()}`);
  console.log(`Program:   ${PROGRAM_ID.toBase58()}`);

  // One-time: ensure all PriceFeed accounts exist on-chain.
  for (const entry of INDEX_MAPPING) {
    await ensurePriceFeedExists(program, admin, entry);
  }

  // Push immediately, then on schedule.
  await runCycle(program, admin);
  setInterval(() => {
    runCycle(program, admin).catch(err =>
      console.error("[fatal] Cycle threw:", (err as Error).message),
    );
  }, PUSH_INTERVAL_MS);
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
