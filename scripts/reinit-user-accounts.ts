/**
 * reinit-user-accounts.ts
 *
 * Derives the UserAccount PDA for a specific wallet, logs the current on-chain
 * owner, and (re-)creates it under the current program if needed.
 *
 * Flow:
 *   1. Read program ID from program/Anchor.toml [programs.devnet]
 *   2. Derive PDA: [b"user_account", wallet]
 *   3. Fetch + log the current owner
 *   4. If owned by current program → "already initialized", exit
 *   5. Otherwise → call initialize_user_account if present in IDL,
 *      else fall back to deposit(1) which uses init_if_needed
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/reinit-user-accounts.ts
 *
 * Admin keypair (for fee-paying when the user account has no SOL):
 *   - scripts/admin-keypair.json   (JSON byte array)
 *   - ADMIN_KEYPAIR env var        (base58-encoded 64-byte secret)
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";

// ── Hard-coded constants ──────────────────────────────────────────────────────

const RPC         = "https://devnet.helius-rpc.com/?api-key=f6fe2699-bbfb-4999-b2e5-e58ebd674f2e";
const WALLET      = new PublicKey("CSLQsy314KoBqbYFRdvD8grJFCKPN4myHnBp7Avo2JsG");
const USDC_MINT   = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
const TOKEN_PROG  = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATP         = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const ADMIN_B58_FALLBACK =
  "4tBrDaonWxNFUzZgGAPn8ipUzAHGpBa3iZ9NtxRPV4ADaLe6iY5ULR6dJ5cfag8NF9DEZfYx4YvVwub2q9UCm8N2";

// ── Helpers ───────────────────────────────────────────────────────────────────

function readProgramId(): PublicKey {
  const tomlPath = path.join(__dirname, "..", "program", "Anchor.toml");
  const content  = fs.readFileSync(tomlPath, "utf8");
  const match    = content.match(/\[programs\.devnet\][\s\S]*?cs_skin_futures\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("Could not parse [programs.devnet] from Anchor.toml");
  return new PublicKey(match[1]);
}

function loadAdminKeypair(): Keypair {
  const jsonPath = path.join(__dirname, "admin-keypair.json");
  if (fs.existsSync(jsonPath)) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(jsonPath, "utf8"))),
    );
  }
  const b58src = process.env.ADMIN_KEYPAIR ?? ADMIN_B58_FALLBACK;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bs58 = require("bs58") as { decode(s: string): Uint8Array };
  return Keypair.fromSecretKey(bs58.decode(b58src));
}

function loadUserKeypair(): Keypair {
  const candidates = [
    path.join(__dirname, "..", "CSLQsy314KoBqbYFRdvD8grJFCKPN4myHnBp7Avo2JsG.json"),
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", "CSLQsy314KoBqbYFRdvD8grJFCKPN4myHnBp7Avo2JsG.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
      );
    }
  }
  throw new Error("CSLQsy314…Avo2JsG.json not found in project root or home directory");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const ROOT       = path.join(__dirname, "..");
  const PROGRAM_ID = readProgramId();
  const conn       = new Connection(RPC, "confirmed");

  console.log("=== reinit-user-accounts ===");
  console.log(`Program : ${PROGRAM_ID.toBase58()}`);
  console.log(`Wallet  : ${WALLET.toBase58()}`);
  console.log(`RPC     : ${RPC}\n`);

  // ── Load keypairs ──────────────────────────────────────────────────────────
  const admin = loadAdminKeypair();
  const user  = loadUserKeypair();

  console.log(`Admin   : ${admin.publicKey.toBase58()}`);
  console.log(`User    : ${user.publicKey.toBase58()}`);

  if (!user.publicKey.equals(WALLET)) {
    throw new Error(
      `User keypair public key ${user.publicKey.toBase58()} ≠ expected ${WALLET.toBase58()}`,
    );
  }

  // ── Derive UserAccount PDA ─────────────────────────────────────────────────
  const [userAccountPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), WALLET.toBuffer()],
    PROGRAM_ID,
  );
  console.log(`\nUserAccount PDA : ${userAccountPda.toBase58()} (bump ${bump})`);

  // ── Fetch current on-chain state ───────────────────────────────────────────
  const info = await conn.getAccountInfo(userAccountPda);

  if (info === null) {
    console.log("Owner           : <account does not exist>");
  } else {
    const disc = info.data.length >= 8
      ? Array.from(info.data.slice(0, 8)).map(b => b.toString(16).padStart(2, "0")).join(" ")
      : "<no data>";
    console.log(`Owner           : ${info.owner.toBase58()}`);
    console.log(`Lamports        : ${info.lamports}`);
    console.log(`Data length     : ${info.data.length} bytes`);
    console.log(`Discriminator   : ${disc}`);
  }

  // ── Check: already owned by current program? ───────────────────────────────
  if (info !== null && info.owner.equals(PROGRAM_ID)) {
    console.log("\n✓ UserAccount already initialized and owned by the current program.");
    console.log("  Nothing to do — exiting.");
    return;
  }

  // ── Need to create (or recreate) the UserAccount ──────────────────────────
  if (info !== null) {
    console.log(
      `\n⚠  Account exists but is owned by ${info.owner.toBase58()}, not the current program.`,
    );
    console.log("   The old account must be closed via its owning program before reinit.");
    console.log("   Proceeding will attempt to create the PDA under the current program.");
    console.log("   This will fail unless the old account is first closed.\n");
  } else {
    console.log("\n  Account does not exist — creating fresh.\n");
  }

  // ── Load IDL and build program client ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IDL = require("../src/lib/idl/cs_skin_futures.json");

  const provider = new anchor.AnchorProvider(
    conn,
    new anchor.Wallet(user),
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as unknown as anchor.Idl, provider);

  // ── Prefer initialize_user_account if the IDL exposes it ──────────────────
  const hasInitIx = (IDL.instructions as Array<{ name: string }>).some(
    i => i.name === "initialize_user_account",
  );

  if (hasInitIx) {
    console.log("  [init] initialize_user_account …");
    const sig = await (program.methods as Record<string, CallableFunction>)
      .initializeUserAccount()
      .accounts({
        owner:         user.publicKey,
        userAccount:   userAccountPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
    console.log(`  [ok]   sig=${sig}`);
  } else {
    // ── Fallback: deposit(1) which triggers init_if_needed ─────────────────
    console.log("  [note] initialize_user_account not found in IDL.");
    console.log("         Falling back to deposit(1 lamport) — uses init_if_needed.");

    const [vaultData]  = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID);
    const [vaultToken] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), USDC_MINT.toBuffer()],
      PROGRAM_ID,
    );
    const [userUsdc]   = PublicKey.findProgramAddressSync(
      [WALLET.toBuffer(), TOKEN_PROG.toBuffer(), USDC_MINT.toBuffer()],
      ATP,
    );

    console.log(`  vault_data    : ${vaultData.toBase58()}`);
    console.log(`  vault_token   : ${vaultToken.toBase58()}`);
    console.log(`  user_usdc_ata : ${userUsdc.toBase58()}`);

    const sig = await program.methods
      .deposit(new anchor.BN(1))
      .accounts({
        owner:                  user.publicKey,
        userAccount:            userAccountPda,
        userUsdcAccount:        userUsdc,
        vaultToken,
        vaultData,
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROG,
        associatedTokenProgram: ATP,
        systemProgram:          SystemProgram.programId,
      })
      .signers([user])
      .rpc();
    console.log(`  [ok]   sig=${sig}`);
  }

  console.log("\n=== Done — UserAccount initialized under the current program ===");
}

main().catch(err => {
  console.error("\n[fatal]", err?.message ?? err);
  if (err?.logs) err.logs.forEach((l: string) => console.error(" ", l));
  process.exit(1);
});
