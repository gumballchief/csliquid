/**
 * init-devnet.ts — One-time setup for cs-skin-futures on devnet.
 *
 * Initializes: vault, liquidity pool, price feeds (x4), markets (x4).
 * Safe to re-run — already-existing accounts are skipped.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/init-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

import IDL from "../src/lib/idl/cs_skin_futures.json";

// ── Config ──────────────────────────────────────────────────────────────────

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH   = process.env.KEYPAIR_PATH   ?? path.join(os.homedir(), ".config", "solana", "id.json");

const PROGRAM_ID = new PublicKey("76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f");
const USDC_MINT  = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const INDEX_IDS = ["awp-index", "ak47-index", "knife-index", "glove-index"] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

function priceFeedPda(indexId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("price_feed"), Buffer.from(indexId)],
    PROGRAM_ID,
  )[0];
}

function marketPda(feed: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), feed.toBuffer()],
    PROGRAM_ID,
  )[0];
}

function vaultDataPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID)[0];
}

function vaultTokenPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), USDC_MINT.toBuffer()],
    PROGRAM_ID,
  )[0];
}

function vaultAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault_authority")], PROGRAM_ID)[0];
}

function liquidityPoolPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("liquidity_pool")], PROGRAM_ID)[0];
}

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

async function exists(connection: Connection, pda: PublicKey): Promise<boolean> {
  const info = await connection.getAccountInfo(pda);
  return info !== null;
}

// ── Steps ───────────────────────────────────────────────────────────────────

async function initVault(program: anchor.Program, admin: Keypair): Promise<void> {
  const vaultData = vaultDataPda();
  if (await exists(program.provider.connection, vaultData)) {
    console.log("  [skip] vault already initialized");
    return;
  }
  console.log("  [init] vault ...");
  const sig = await program.methods
    .initializeVault()
    .accounts({
      authority:      admin.publicKey,
      vaultData,
      vaultToken:     vaultTokenPda(),
      vaultAuthority: vaultAuthorityPda(),
      usdcMint:       USDC_MINT,
      tokenProgram:   TOKEN_PROG,
      systemProgram:  SystemProgram.programId,
    })
    .signers([admin])
    .rpc();
  console.log(`  [ok]   vault  sig=${sig.slice(0, 12)}…`);
}

async function initPool(program: anchor.Program, admin: Keypair): Promise<void> {
  const pool = liquidityPoolPda();
  if (await exists(program.provider.connection, pool)) {
    console.log("  [skip] liquidity pool already initialized");
    return;
  }
  console.log("  [init] liquidity pool ...");
  const sig = await program.methods
    .initializePool()
    .accounts({
      authority:     admin.publicKey,
      liquidityPool: pool,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();
  console.log(`  [ok]   pool   sig=${sig.slice(0, 12)}…`);
}

async function initPriceFeed(program: anchor.Program, admin: Keypair, indexId: string): Promise<void> {
  const feed = priceFeedPda(indexId);
  if (await exists(program.provider.connection, feed)) {
    console.log(`  [skip] price feed ${indexId} already initialized`);
    return;
  }
  console.log(`  [init] price feed ${indexId} → ${feed.toBase58().slice(0, 8)}…`);
  const sig = await program.methods
    .initializePriceFeed(indexId)
    .accounts({
      authority:     admin.publicKey,
      priceFeed:     feed,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();
  console.log(`  [ok]   feed   sig=${sig.slice(0, 12)}…`);
}

async function initMarket(program: anchor.Program, admin: Keypair, indexId: string): Promise<void> {
  const feed   = priceFeedPda(indexId);
  const market = marketPda(feed);
  if (await exists(program.provider.connection, market)) {
    console.log(`  [skip] market ${indexId} already initialized`);
    return;
  }
  console.log(`  [init] market ${indexId} → ${market.toBase58().slice(0, 8)}…`);
  const sig = await program.methods
    .initializeMarket({ skinId: indexId, priceFeed: feed })
    .accounts({
      authority:     admin.publicKey,
      market,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();
  console.log(`  [ok]   market sig=${sig.slice(0, 12)}…`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== cs-skin-futures devnet initializer ===");
  console.log(`RPC:       ${SOLANA_RPC_URL}`);

  const admin   = loadKeypair(KEYPAIR_PATH);
  const program = buildProgram(admin);
  const bal     = await program.provider.connection.getBalance(admin.publicKey);

  console.log(`Authority: ${admin.publicKey.toBase58()}`);
  console.log(`Balance:   ${(bal / 1e9).toFixed(4)} SOL`);
  console.log(`Program:   ${PROGRAM_ID.toBase58()}\n`);

  console.log("1. Vault");
  await initVault(program, admin);

  console.log("\n2. Liquidity Pool");
  await initPool(program, admin);

  console.log("\n3. Price Feeds");
  for (const id of INDEX_IDS) {
    await initPriceFeed(program, admin, id);
  }

  console.log("\n4. Markets");
  for (const id of INDEX_IDS) {
    await initMarket(program, admin, id);
  }

  console.log("\n=== Done — all accounts initialized ===");
  console.log("Next: run the oracle + price pusher:");
  console.log("  cd services/oracle && npm run dev");
  console.log("  npx ts-node --project scripts/tsconfig.json scripts/push-prices.ts");
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
