/**
 * init-awp-market.ts
 *
 * Initializes the missing price_feed and market PDAs for skin_id "AWP"
 * under the current program.  Both accounts were previously only deployed
 * under "awp-index"; the new instruction set references "AWP".
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/init-awp-market.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const RPC     = "https://devnet.helius-rpc.com/?api-key=f6fe2699-bbfb-4999-b2e5-e58ebd674f2e";
const SKIN_ID = "AWP";

const ADMIN_B58 =
  "4tBrDaonWxNFUzZgGAPn8ipUzAHGpBa3iZ9NtxRPV4ADaLe6iY5ULR6dJ5cfag8NF9DEZfYx4YvVwub2q9UCm8N2";

// ── Helpers ───────────────────────────────────────────────────────────────────

function readProgramId(): PublicKey {
  const tomlPath = path.join(__dirname, "..", "program", "Anchor.toml");
  const content  = fs.readFileSync(tomlPath, "utf8");
  const match    = content.match(/\[programs\.devnet\][\s\S]*?cs_skin_futures\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("Could not parse [programs.devnet] from Anchor.toml");
  return new PublicKey(match[1]);
}

function loadAdmin(): Keypair {
  const jsonPath = path.join(__dirname, "admin-keypair.json");
  if (fs.existsSync(jsonPath)) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(jsonPath, "utf8"))),
    );
  }
  const b58src = process.env.ADMIN_KEYPAIR ?? ADMIN_B58;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bs58 = require("bs58") as { decode(s: string): Uint8Array };
  return Keypair.fromSecretKey(bs58.decode(b58src));
}

async function accountExists(conn: Connection, addr: PublicKey): Promise<boolean> {
  const info = await conn.getAccountInfo(addr);
  return info !== null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const PROGRAM_ID = readProgramId();
  const conn       = new Connection(RPC, "confirmed");
  const admin      = loadAdmin();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IDL     = require("../src/lib/idl/cs_skin_futures.json");
  const provider = new anchor.AnchorProvider(
    conn,
    new anchor.Wallet(admin),
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as unknown as anchor.Idl, provider);

  console.log("=== init-awp-market ===");
  console.log(`Program   : ${PROGRAM_ID.toBase58()}`);
  console.log(`Admin     : ${admin.publicKey.toBase58()}`);
  console.log(`Skin ID   : "${SKIN_ID}"`);
  console.log(`RPC       : ${RPC}\n`);

  // ── 1. Derive PDAs ─────────────────────────────────────────────────────────
  const [priceFeedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("price_feed"), Buffer.from(SKIN_ID)],
    PROGRAM_ID,
  );
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), priceFeedPda.toBuffer()],
    PROGRAM_ID,
  );

  console.log(`PriceFeed PDA : ${priceFeedPda.toBase58()}`);
  console.log(`Market PDA    : ${marketPda.toBase58()}\n`);

  // ── 2. Initialize PriceFeed ────────────────────────────────────────────────
  if (await accountExists(conn, priceFeedPda)) {
    const info  = await conn.getAccountInfo(priceFeedPda);
    const owner = info!.owner.toBase58();
    if (owner === PROGRAM_ID.toBase58()) {
      console.log(`[skip] price_feed already owned by current program`);
    } else {
      console.error(`[error] price_feed exists but owned by ${owner} — cannot reinit`);
      process.exit(1);
    }
  } else {
    console.log(`[init] price_feed("${SKIN_ID}") …`);
    const sig = await program.methods
      .initializePriceFeed(SKIN_ID)
      .accounts({
        authority:    admin.publicKey,
        priceFeed:    priceFeedPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    console.log(`[ok]   price_feed  sig=${sig}`);
  }

  // ── 3. Initialize Market ───────────────────────────────────────────────────
  if (await accountExists(conn, marketPda)) {
    const info  = await conn.getAccountInfo(marketPda);
    const owner = info!.owner.toBase58();
    if (owner === PROGRAM_ID.toBase58()) {
      console.log(`[skip] market already owned by current program`);
    } else {
      console.error(`[error] market exists but owned by ${owner} — cannot reinit`);
      process.exit(1);
    }
  } else {
    console.log(`[init] market("${SKIN_ID}") …`);
    const sig = await program.methods
      .initializeMarket({ skinId: SKIN_ID, priceFeed: priceFeedPda })
      .accounts({
        authority:    admin.publicKey,
        market:       marketPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    console.log(`[ok]   market      sig=${sig}`);
  }

  console.log("\n=== Done ===");
  console.log(`price_feed : ${priceFeedPda.toBase58()}`);
  console.log(`market     : ${marketPda.toBase58()}`);
  console.log("\nNext: push an initial price to the new price_feed so open_position");
  console.log('can read a fresh oracle price. Run push-prices.ts or call push_price');
  console.log(`with authority=${admin.publicKey.toBase58()}.`);
}

main().catch(err => {
  console.error("\n[fatal]", err?.message ?? err);
  if (err?.logs) err.logs.forEach((l: string) => console.error(" ", l));
  process.exit(1);
});
