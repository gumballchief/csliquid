/**
 * init-remaining-markets.ts
 *
 * Initializes price_feed + market PDAs for AK47, KNIFE, GLOVE, CS500.
 * Skips any that already exist and are owned by the current program.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/init-remaining-markets.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const RPC     = "https://devnet.helius-rpc.com/?api-key=f6fe2699-bbfb-4999-b2e5-e58ebd674f2e";
const SKINS   = ["AK47", "KNIFE", "GLOVE", "CS500"];

const ADMIN_B58 =
  "4tBrDaonWxNFUzZgGAPn8ipUzAHGpBa3iZ9NtxRPV4ADaLe6iY5ULR6dJ5cfag8NF9DEZfYx4YvVwub2q9UCm8N2";

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
  const b58 = process.env.ADMIN_KEYPAIR ?? ADMIN_B58;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bs58 = require("bs58") as { decode(s: string): Uint8Array };
  return Keypair.fromSecretKey(bs58.decode(b58));
}

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

  console.log("=== init-remaining-markets ===");
  console.log(`Program : ${PROGRAM_ID.toBase58()}`);
  console.log(`Admin   : ${admin.publicKey.toBase58()}`);
  console.log(`Skins   : ${SKINS.join(", ")}\n`);

  // Derive all PDAs up front
  const pdas = SKINS.map(skinId => {
    const [priceFeedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("price_feed"), Buffer.from(skinId)],
      PROGRAM_ID,
    );
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), priceFeedPda.toBuffer()],
      PROGRAM_ID,
    );
    return { skinId, priceFeedPda, marketPda };
  });

  // Batch-fetch all accounts
  const allKeys  = pdas.flatMap(p => [p.priceFeedPda, p.marketPda]);
  const allInfos = await conn.getMultipleAccountsInfo(allKeys);

  for (let i = 0; i < pdas.length; i++) {
    const { skinId, priceFeedPda, marketPda } = pdas[i];
    const pfInfo  = allInfos[i * 2];
    const mktInfo = allInfos[i * 2 + 1];

    console.log(`── ${skinId} ──`);
    console.log(`   price_feed : ${priceFeedPda.toBase58()}`);
    console.log(`   market     : ${marketPda.toBase58()}`);

    // ── PriceFeed ────────────────────────────────────────────────────────────
    if (pfInfo !== null) {
      if (pfInfo.owner.equals(PROGRAM_ID)) {
        console.log(`   [skip] price_feed already owned by current program`);
      } else {
        console.error(`   [error] price_feed owned by ${pfInfo.owner.toBase58()} — skipping`);
        continue;
      }
    } else {
      process.stdout.write(`   [init] price_feed("${skinId}") … `);
      const sig = await program.methods
        .initializePriceFeed(skinId)
        .accounts({
          authority:    admin.publicKey,
          priceFeed:    priceFeedPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      console.log(`ok  sig=${sig.slice(0, 16)}…`);
    }

    // ── Market ───────────────────────────────────────────────────────────────
    if (mktInfo !== null) {
      if (mktInfo.owner.equals(PROGRAM_ID)) {
        console.log(`   [skip] market already owned by current program`);
      } else {
        console.error(`   [error] market owned by ${mktInfo.owner.toBase58()} — skipping`);
      }
    } else {
      process.stdout.write(`   [init] market("${skinId}") … `);
      const sig = await program.methods
        .initializeMarket({ skinId, priceFeed: priceFeedPda })
        .accounts({
          authority:    admin.publicKey,
          market:       marketPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      console.log(`ok  sig=${sig.slice(0, 16)}…`);
    }

    console.log();
  }

  console.log("=== Done ===");
}

main().catch(err => {
  console.error("\n[fatal]", err?.message ?? err);
  if (err?.logs) err.logs.forEach((l: string) => console.error(" ", l));
  process.exit(1);
});
