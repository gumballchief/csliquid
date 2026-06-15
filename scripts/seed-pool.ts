/**
 * seed-pool.ts
 *
 * Deposits USDC from the admin's on-chain UserAccount into the LiquidityPool
 * so that trades can close profitably (pool pays out PnL to winners).
 *
 * Flow:
 *   1. Read admin UserAccount.usdc_balance (protocol balance)
 *   2. If needed, withdraw that amount from UserAccount → admin ATA
 *   3. Call add_liquidity to move admin ATA → vault_token, credit liquidity_pool
 *   4. Verify and print the resulting LiquidityPool.total_usdc
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/seed-pool.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

const TOKEN_PROGRAM_ID  = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOC_TOKEN_PROG  = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const RPC        = "https://devnet.helius-rpc.com/?api-key=f6fe2699-bbfb-4999-b2e5-e58ebd674f2e";
const PROGRAM_ID = new PublicKey("76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f");
const USDC_MINT  = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
const ADMIN_B58  = "4tBrDaonWxNFUzZgGAPn8ipUzAHGpBa3iZ9NtxRPV4ADaLe6iY5ULR6dJ5cfag8NF9DEZfYx4YvVwub2q9UCm8N2";

const TARGET = BigInt(1_000_000) * BigInt(1_000_000); // 1 M USDC in micro-USDC

// Derive the standard ATA address: [owner, tokenProgram, mint] via AssocTokenProgram
function ata(owner: PublicKey, mint: PublicKey): PublicKey {
  const [addr] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROG,
  );
  return addr;
}

// Read u64 LE from a Buffer (returns bigint)
function readU64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bs58 = require("bs58") as { decode(s: string): Uint8Array };
  const admin = Keypair.fromSecretKey(bs58.decode(ADMIN_B58));
  const conn  = new Connection(RPC, "confirmed");

  console.log("=== seed-pool ===");
  console.log(`Admin   : ${admin.publicKey.toBase58()}`);
  console.log(`RPC     : ${RPC}\n`);

  // ── Derive PDAs ────────────────────────────────────────────────────────────
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), admin.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const [vaultData] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    PROGRAM_ID,
  );
  const [vaultToken] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), USDC_MINT.toBuffer()],
    PROGRAM_ID,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    PROGRAM_ID,
  );
  const [liquidityPool] = PublicKey.findProgramAddressSync(
    [Buffer.from("liquidity_pool")],
    PROGRAM_ID,
  );
  const [lpPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_position"), admin.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const adminUsdcAta = ata(admin.publicKey, USDC_MINT);

  console.log(`UserAccount PDA : ${userAccountPda.toBase58()}`);
  console.log(`LiquidityPool   : ${liquidityPool.toBase58()}`);
  console.log(`Admin ATA       : ${adminUsdcAta.toBase58()}`);

  // ── Load Anchor program ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IDL = require("../src/lib/idl/cs_skin_futures.json");
  const provider = new anchor.AnchorProvider(
    conn,
    new anchor.Wallet(admin),
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL as unknown as anchor.Idl, provider);

  // ── Check admin UserAccount.usdc_balance ───────────────────────────────────
  const uaInfo = await conn.getAccountInfo(userAccountPda);
  let userBalance = BigInt(0);
  if (uaInfo && uaInfo.data.length >= 49) {
    userBalance = readU64LE(Buffer.from(uaInfo.data), 40); // disc(8)+owner(32)=40
    console.log(`\nUserAccount.usdc_balance : ${userBalance} µUSDC (${Number(userBalance) / 1_000_000} USDC)`);
  } else {
    console.log("\nAdmin UserAccount not found or empty");
  }

  // ── Check admin ATA SPL balance ────────────────────────────────────────────
  const ataInfo = await conn.getAccountInfo(adminUsdcAta);
  let ataBalance = BigInt(0);
  if (ataInfo && ataInfo.data.length >= 72) {
    ataBalance = readU64LE(Buffer.from(ataInfo.data), 64); // mint(32)+owner(32)=64
    console.log(`Admin ATA USDC           : ${ataBalance} µUSDC (${Number(ataBalance) / 1_000_000} USDC)`);
  } else {
    console.log("Admin ATA not found (no SPL USDC in wallet)");
  }

  // ── Check existing pool balance ────────────────────────────────────────────
  const poolInfoBefore = await conn.getAccountInfo(liquidityPool);
  if (poolInfoBefore && poolInfoBefore.data.length >= 49) {
    const poolUsdc = readU64LE(Buffer.from(poolInfoBefore.data), 40); // disc(8)+authority(32)=40
    console.log(`Pool total_usdc (before) : ${poolUsdc} µUSDC (${Number(poolUsdc) / 1_000_000} USDC)\n`);
  }

  // ── Step 1: Withdraw from UserAccount → ATA if needed ─────────────────────
  // We want at least (TARGET - ataBalance) from UserAccount, capped at userBalance
  const ataShortfall = TARGET > ataBalance ? TARGET - ataBalance : BigInt(0);
  const withdrawAmt  = ataShortfall > userBalance ? userBalance : ataShortfall;

  if (withdrawAmt > BigInt(0)) {
    console.log(`Withdrawing ${Number(withdrawAmt) / 1_000_000} USDC from UserAccount → ATA...`);
    const sig = await program.methods
      .withdraw(new anchor.BN(withdrawAmt.toString()))
      .accounts({
        owner:                  admin.publicKey,
        userAccount:            userAccountPda,
        userUsdcAccount:        adminUsdcAta,
        vaultToken,
        vaultData,
        vaultAuthority,
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOC_TOKEN_PROG,
        systemProgram:          SystemProgram.programId,
      } as any)
      .signers([admin])
      .rpc();
    console.log(`  withdraw tx : ${sig}`);
    ataBalance += withdrawAmt;
  }

  // ── Step 2: add_liquidity ──────────────────────────────────────────────────
  const depositAmt = ataBalance >= TARGET ? TARGET : ataBalance;
  if (depositAmt === BigInt(0)) {
    console.error("Nothing to deposit — admin has no USDC in ATA or UserAccount.");
    process.exit(1);
  }

  console.log(`\nAdding ${Number(depositAmt) / 1_000_000} USDC to pool (add_liquidity)...`);
  const addSig = await program.methods
    .addLiquidity(new anchor.BN(depositAmt.toString()))
    .accounts({
      owner:           admin.publicKey,
      lpPosition,
      liquidityPool,
      userUsdcAccount: adminUsdcAta,
      vaultToken,
      vaultData,
      usdcMint:        USDC_MINT,
      tokenProgram:    TOKEN_PROGRAM_ID,
      systemProgram:   SystemProgram.programId,
    } as any)
    .signers([admin])
    .rpc();
  console.log(`  add_liquidity tx : ${addSig}`);

  // ── Verify ─────────────────────────────────────────────────────────────────
  const poolInfoAfter = await conn.getAccountInfo(liquidityPool);
  if (poolInfoAfter && poolInfoAfter.data.length >= 65) {
    const buf      = Buffer.from(poolInfoAfter.data);
    const totalUsdc = readU64LE(buf, 40); // disc(8)+authority(32)=40
    const lpSupply  = readU64LE(buf, 48);
    const fees      = readU64LE(buf, 56);
    console.log(`\n=== LiquidityPool after deposit ===`);
    console.log(`  total_usdc  : ${totalUsdc} µUSDC = ${(Number(totalUsdc) / 1_000_000).toLocaleString()} USDC`);
    console.log(`  lp_supply   : ${lpSupply}`);
    console.log(`  fees_earned : ${fees} µUSDC`);
  }

  console.log("\n=== Done ===");
}

main().catch(err => {
  console.error("\n[fatal]", err?.message ?? err);
  if (err?.logs) err.logs.forEach((l: string) => console.error(" ", l));
  process.exit(1);
});
