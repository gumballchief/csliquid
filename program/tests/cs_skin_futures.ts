/**
 * Full-flow integration test for the cs_skin_futures Anchor program.
 *
 * Uses anchor-bankrun so no local validator is required:
 *   anchor test --skip-local-validator
 *
 * Prerequisites:
 *   1. Run `anchor build` to produce target/deploy/cs_skin_futures.so
 *      and target/types/cs_skin_futures.ts.
 *   2. Run `yarn install` in this directory.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import { Clock, ProgramTestContext, startAnchor } from "solana-bankrun";
import { assert } from "chai";
import { createHash } from "crypto";
import type { CsSkinFutures } from "../target/types/cs_skin_futures";

// ─── Network constants ────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(
  "76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f",
);

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

// ─── PriceFeed mock (our custom on-chain struct) ──────────────────────────────

/**
 * Compute the 8-byte Anchor account discriminator for a given account name.
 * Anchor uses sha256("account:<Name>")[0..8].
 */
function anchorDiscriminator(accountName: string): Buffer {
  return Buffer.from(
    createHash("sha256").update(`account:${accountName}`).digest(),
  ).subarray(0, 8);
}

const PRICE_FEED_DISC = anchorDiscriminator("PriceFeed");

/**
 * Write a fresh PriceFeed account owned by our program.
 * published_at = clockTs so oracle.rs staleness check passes (age = 0).
 *
 * PriceFeed layout (Borsh):
 *   [0..8]   discriminator
 *   [8..40]  authority (Pubkey)
 *   [40..48] price (u64 LE, 6-decimal USDC: $42.50 → 42_500_000)
 *   [48..56] published_at (i64 LE)
 *   [56]     bump (u8 — 0 for test keypair, not a PDA)
 */
function setPriceFeed(
  ctx: ProgramTestContext,
  feedKey: PublicKey,
  authority: PublicKey,
  priceUsd: number,
  clockTs: bigint,
): void {
  const price = BigInt(Math.round(priceUsd * 1_000_000));
  const buf = Buffer.alloc(8 + 32 + 8 + 8 + 1);
  PRICE_FEED_DISC.copy(buf, 0);
  authority.toBuffer().copy(buf, 8);
  buf.writeBigUInt64LE(price, 40);
  buf.writeBigInt64LE(BigInt(clockTs), 48);
  ctx.setAccount(feedKey, {
    lamports:   1_000_000n,
    data:       buf,
    owner:      PROGRAM_ID,
    executable: false,
  });
}

// ─── SPL Token layout helpers (no @solana/spl-token dependency) ──────────────

// SPL Mint account — 82 bytes
function encodeMint(mintAuthority: PublicKey): Buffer {
  const buf = Buffer.alloc(82);
  buf.writeUInt32LE(1, 0);              // COption::Some
  mintAuthority.toBuffer().copy(buf, 4);// [4..36] authority
  buf.writeBigUInt64LE(0n, 36);         // supply = 0
  buf[44] = 6;                          // decimals = 6
  buf[45] = 1;                          // is_initialized = true
  buf.writeUInt32LE(0, 46);             // freeze_authority = None
  return buf;
}

// SPL TokenAccount — 165 bytes
function encodeTokenAccount(
  mint: PublicKey,
  splOwner: PublicKey, // SPL authority (not the Solana program owner)
  amount: bigint,
): Buffer {
  const buf = Buffer.alloc(165);
  mint.toBuffer().copy(buf, 0);         // [0..32]   mint
  splOwner.toBuffer().copy(buf, 32);    // [32..64]  owner
  buf.writeBigUInt64LE(amount, 64);     // [64..72]  amount
  buf.writeUInt32LE(0, 72);             // delegate = None
  buf[108] = 1;                         // state = initialized
  buf.writeUInt32LE(0, 109);            // is_native = None
  buf.writeBigUInt64LE(0n, 121);        // delegated_amount
  buf.writeUInt32LE(0, 129);            // close_authority = None
  return buf;
}

// ─── PDA helpers ──────────────────────────────────────────────────────────────

function pda(seeds: (string | Buffer | Uint8Array)[], programId = PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    seeds.map((s) => (typeof s === "string" ? Buffer.from(s) : Buffer.from(s))),
    programId,
  )[0];
}

const findMarket         = (feed: PublicKey) =>
  pda(["market",         feed.toBuffer()]);
const findPosition       = (owner: PublicKey, mkt: PublicKey) =>
  pda(["position",       owner.toBuffer(), mkt.toBuffer()]);
const findUserAccount    = (owner: PublicKey) =>
  pda(["user_account",   owner.toBuffer()]);
const findVaultToken     = (mint: PublicKey) =>
  pda(["vault",          mint.toBuffer()]);
const findVaultData      = () => pda(["vault"]);
const findVaultAuthority = () => pda(["vault_authority"]);

function ataAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Read the u64 amount field from an SPL token account (offset 64). */
async function tokenBalance(
  ctx: ProgramTestContext,
  key: PublicKey,
): Promise<bigint> {
  const info = await ctx.banksClient.getAccount(key);
  if (!info) return 0n;
  return Buffer.from(info.data).readBigUInt64LE(64);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("cs_skin_futures", () => {
  let context:  ProgramTestContext;
  let program:  Program<CsSkinFutures>;

  let authorityKp:  Keypair;
  let traderKp:     Keypair;
  let liquidatorKp: Keypair;
  let usdcMintKp:   Keypair;
  let priceFeedKp:  Keypair;

  let marketPda:         PublicKey;
  let vaultTokenPda:     PublicKey;
  let vaultDataPda:      PublicKey;
  let vaultAuthorityPda: PublicKey;
  let liquidityPoolPda:  PublicKey;
  let traderAta:         PublicKey;
  let liquidatorAta:     PublicKey;

  // Monotonically advancing clock timestamp shared across tests
  let clockTs = 1_700_000_000n;

  // ─── Setup ─────────────────────────────────────────────────────────────────

  before(async () => {
    authorityKp  = Keypair.generate();
    traderKp     = Keypair.generate();
    liquidatorKp = Keypair.generate();
    usdcMintKp   = Keypair.generate();
    priceFeedKp  = Keypair.generate();

    marketPda         = findMarket(priceFeedKp.publicKey);
    vaultTokenPda     = findVaultToken(usdcMintKp.publicKey);
    vaultDataPda      = findVaultData();
    vaultAuthorityPda = findVaultAuthority();
    liquidityPoolPda  = pda(["liquidity_pool"]);
    traderAta         = ataAddress(traderKp.publicKey, usdcMintKp.publicKey);
    liquidatorAta     = ataAddress(liquidatorKp.publicKey, usdcMintKp.publicKey);

    // startAnchor loads programs from target/deploy/ — run `anchor build` first
    context = await startAnchor(".", [], []);
    const provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = anchor.workspace.CsSkinFutures as Program<CsSkinFutures>;

    // Fund each actor with 10 SOL for rent payments
    const tenSol: bigint = 10_000_000_000n;
    for (const kp of [authorityKp, traderKp, liquidatorKp]) {
      context.setAccount(kp.publicKey, {
        lamports:   tenSol,
        data:       new Uint8Array(0),
        owner:      SystemProgram.programId,
        executable: false,
      });
    }

    // USDC mint (6 decimals)
    context.setAccount(usdcMintKp.publicKey, {
      lamports:   1_461_600n, // rent-exempt minimum for 82 bytes
      data:       encodeMint(authorityKp.publicKey),
      owner:      TOKEN_PROGRAM_ID,
      executable: false,
    });

    // Trader USDC ATA: pre-funded with 1 000 USDC (1_000_000_000 lamports)
    context.setAccount(traderAta, {
      lamports:   2_039_280n,
      data:       encodeTokenAccount(usdcMintKp.publicKey, traderKp.publicKey, 1_000_000_000n),
      owner:      TOKEN_PROGRAM_ID,
      executable: false,
    });

    // Liquidator USDC ATA: empty at start, receives the 5% bonus
    context.setAccount(liquidatorAta, {
      lamports:   2_039_280n,
      data:       encodeTokenAccount(usdcMintKp.publicKey, liquidatorKp.publicKey, 0n),
      owner:      TOKEN_PROGRAM_ID,
      executable: false,
    });

    // Protocol vault token account: pre-seeded with 1 000 000 USDC so that
    // profitable closes never hit an SPL "insufficient funds" error
    // (in production, LPs deposit here via the deposit instruction).
    context.setAccount(vaultTokenPda, {
      lamports:   2_039_280n,
      data:       encodeTokenAccount(usdcMintKp.publicKey, vaultAuthorityPda, 1_000_000_000_000n),
      owner:      TOKEN_PROGRAM_ID,
      executable: false,
    });

    // Pre-seed vaultData (Vault struct) so open/close/liquidate can access it
    // without init_if_needed (vault is pre-initialized by protocol).
    const vaultBump = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID)[1];
    const vaultDataBuf = Buffer.alloc(8 + 8 + 1);
    anchorDiscriminator("Vault").copy(vaultDataBuf, 0);
    vaultDataBuf.writeBigUInt64LE(0n, 8);   // total_liquidity = 0
    vaultDataBuf[16] = vaultBump;            // bump
    context.setAccount(vaultDataPda, {
      lamports: 1_000_000n,
      data: vaultDataBuf,
      owner: PROGRAM_ID,
      executable: false,
    });

    // Pre-seed liquidityPool so open/close/liquidate can update OI / fees.
    const poolBump = PublicKey.findProgramAddressSync([Buffer.from("liquidity_pool")], PROGRAM_ID)[1];
    const poolBuf = Buffer.alloc(8 + 32 + 8 + 8 + 8 + 8 + 8 + 1);
    anchorDiscriminator("LiquidityPool").copy(poolBuf, 0);
    // authority at [8..40] — zero pubkey OK for tests
    poolBuf.writeBigUInt64LE(0n, 40);  // total_usdc
    poolBuf.writeBigUInt64LE(0n, 48);  // lp_supply
    poolBuf.writeBigUInt64LE(0n, 56);  // fees_earned
    poolBuf.writeBigInt64LE(0n, 64);   // trader_pnl_paid
    poolBuf.writeBigInt64LE(0n, 72);   // inception_ts
    poolBuf[80] = poolBump;             // bump
    context.setAccount(liquidityPoolPda, {
      lamports: 1_000_000n,
      data: poolBuf,
      owner: PROGRAM_ID,
      executable: false,
    });

    // Set clock and initial price feed to $42.50
    context.setClock(new Clock(100n, clockTs, 1n, 1n, clockTs));
    setPriceFeed(context, priceFeedKp.publicKey, authorityKp.publicKey, 42.5, clockTs);
  });

  // ─── 1. Initialize market ─────────────────────────────────────────────────

  it("initializes the AK-47 | Redline market", async () => {
    await program.methods
      .initializeMarket({
        skinId:    "AK-47 | Redline (Field-Tested)",
        priceFeed: priceFeedKp.publicKey,
      })
      .accounts({
        authority:     authorityKp.publicKey,
        market:        marketPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([authorityKp])
      .rpc();

    const mkt = await program.account.market.fetch(marketPda);
    assert.equal(mkt.skinId, "AK-47 | Redline (Field-Tested)");
    assert.ok(mkt.priceFeed.equals(priceFeedKp.publicKey), "price_feed stored");
    assert.ok(mkt.authority.equals(authorityKp.publicKey), "authority stored");
    assert.equal(mkt.totalLongOpenInterest.toNumber(),  0, "long OI starts at 0");
    assert.equal(mkt.totalShortOpenInterest.toNumber(), 0, "short OI starts at 0");
    assert.equal(mkt.cumulativeFunding.toNumber(),      0, "cumulative funding starts at 0");
  });

  // ─── 2. Open long position ────────────────────────────────────────────────

  it("opens a 100 USDC long at 2× leverage", async () => {
    const positionPda    = findPosition(traderKp.publicKey, marketPda);
    const userAccountPda = findUserAccount(traderKp.publicKey);
    const balBefore      = await tokenBalance(context, traderAta);

    await program.methods
      .openPosition({
        isLong:        true,
        collateral:    new BN(100_000_000),       // $100 USDC
        leverage:      2,                          // 2× leverage
        maxEntryPrice: new BN("18446744073709551615"), // u64::MAX — no slippage cap
      })
      .accounts({
        owner:                  traderKp.publicKey,
        userAccount:            userAccountPda,
        userUsdcAccount:        traderAta,
        market:                 marketPda,
        position:               positionPda,
        vaultToken:             vaultTokenPda,
        vaultData:              vaultDataPda,
        priceFeed:              priceFeedKp.publicKey,
        liquidityPool:          liquidityPoolPda,
        usdcMint:               usdcMintKp.publicKey,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .signers([traderKp])
      .rpc();

    // ── Position state ──────────────────────────────────────────────────────
    const pos = await program.account.position.fetch(positionPda);
    assert.ok(pos.owner.equals(traderKp.publicKey), "owner stored");
    assert.isTrue(pos.isLong,                        "is_long = true");
    assert.equal(pos.collateral.toNumber(),      100_000_000, "collateral stored");
    assert.equal(pos.entryPrice.toNumber(),       42_500_000, "entry price $42.50");
    // size = notional * SIZE_SCALE / entry_price = 200_000_000 * 1_000_000 / 42_500_000
    assert.equal(pos.size.toNumber(),              4_705_882, "position size (skin units × 10⁶)");
    // liq_price = 42_500_000 * 11_000 / 20_000  (2× long formula)
    assert.equal(pos.liquidationPrice.toNumber(), 23_375_000, "liquidation price $23.375");
    assert.equal(pos.entryFundingIndex.toNumber(), 0,         "entry funding index = 0");

    // ── USDC deducted: collateral (100 USDC) + open fee (0.05% of notional 200) ─
    // taker_fee = 200_000_000 * 5 / 10_000 = 100_000
    const balAfter = await tokenBalance(context, traderAta);
    assert.equal(
      Number(balBefore - balAfter),
      100_100_000,
      "trader debited collateral + open fee",
    );

    // ── Market open interest ────────────────────────────────────────────────
    const mkt = await program.account.market.fetch(marketPda);
    assert.equal(mkt.totalLongOpenInterest.toNumber(),  200_000_000, "long OI = notional");
    assert.equal(mkt.totalShortOpenInterest.toNumber(), 0);
  });

  // ─── 3. Close at profit ($42.50 → $50.00) ────────────────────────────────

  it("returns the correct PnL when closing at $50 (price +17.6%)", async () => {
    const positionPda = findPosition(traderKp.publicKey, marketPda);

    // Advance clock 30 min; price is fresh (published_at == clock)
    clockTs += 1_800n;
    context.setClock(new Clock(200n, clockTs, 1n, 1n, clockTs));
    setPriceFeed(context, priceFeedKp.publicKey, authorityKp.publicKey, 50.0, clockTs);

    const balBefore = await tokenBalance(context, traderAta);

    await program.methods
      .closePosition()
      .accounts({
        owner:                  traderKp.publicKey,
        userAccount:            findUserAccount(traderKp.publicKey),
        userUsdcAccount:        traderAta,
        market:                 marketPda,
        position:               positionPda,
        vaultToken:             vaultTokenPda,
        vaultData:              vaultDataPda,
        vaultAuthority:         vaultAuthorityPda,
        priceFeed:              priceFeedKp.publicKey,
        liquidityPool:          liquidityPoolPda,
        usdcMint:               usdcMintKp.publicKey,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .signers([traderKp])
      .rpc();

    // ── Position account is gone ────────────────────────────────────────────
    const posAcct = await context.banksClient.getAccount(positionPda);
    assert.isNull(posAcct, "position account closed by `close = owner`");

    // ── Net return calculation ──────────────────────────────────────────────
    // notional_at_close = size * entry_price / SIZE_SCALE
    //   = 4_705_882 * 42_500_000 / 1_000_000 = 199_999_985 (truncation)
    // close_fee = 199_999_985 * 5 / 10_000 = 99_999  (Rust truncating division)
    // gross_pnl = (50_000_000 - 42_500_000) * 4_705_882 / 1_000_000
    //           = 7_500_000 * 4_705_882 / 1_000_000 = 35_294_115
    // funding_owed = 0 (cumulative_funding unchanged from 0 since market open)
    // close_fee = 200_000_000 * 5 / 10_000 = 100_000  (uses stored notional now)
    // net_return = 100_000_000 + 35_294_115 − 100_000 = 135_194_115
    const balAfter = await tokenBalance(context, traderAta);
    assert.equal(
      Number(balAfter - balBefore),
      135_194_115,
      "net return = collateral + gross PnL − close fee",
    );

    // ── OI cleared ─────────────────────────────────────────────────────────
    const mkt = await program.account.market.fetch(marketPda);
    assert.equal(mkt.totalLongOpenInterest.toNumber(), 0, "long OI cleared on close");
  });

  // ─── 4. Liquidation when price drops below threshold ─────────────────────

  it("liquidates a position when price crashes below $23.375", async () => {
    const positionPda    = findPosition(traderKp.publicKey, marketPda);
    const userAccountPda = findUserAccount(traderKp.publicKey);

    // Re-price to $42.50 for a clean second open
    clockTs += 60n;
    context.setClock(new Clock(300n, clockTs, 1n, 1n, clockTs));
    setPriceFeed(context, priceFeedKp.publicKey, authorityKp.publicKey, 42.5, clockTs);

    // Open a second 100 USDC long at 2× (previous position was closed)
    await program.methods
      .openPosition({
        isLong:        true,
        collateral:    new BN(100_000_000),
        leverage:      2,
        maxEntryPrice: new BN("18446744073709551615"),
      })
      .accounts({
        owner:                  traderKp.publicKey,
        userAccount:            userAccountPda,
        userUsdcAccount:        traderAta,
        market:                 marketPda,
        position:               positionPda,
        vaultToken:             vaultTokenPda,
        vaultData:              vaultDataPda,
        priceFeed:              priceFeedKp.publicKey,
        liquidityPool:          liquidityPoolPda,
        usdcMint:               usdcMintKp.publicKey,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .signers([traderKp])
      .rpc();

    // Crash price to $22.00 — below liq threshold of $23.375
    clockTs += 60n;
    context.setClock(new Clock(400n, clockTs, 1n, 1n, clockTs));
    setPriceFeed(context, priceFeedKp.publicKey, authorityKp.publicKey, 22.0, clockTs);

    const liqBalBefore = await tokenBalance(context, liquidatorAta);

    await program.methods
      .liquidate()
      .accounts({
        liquidator:             liquidatorKp.publicKey,
        liquidatorUsdcAccount:  liquidatorAta,
        ownerAccount:           userAccountPda,
        market:                 marketPda,
        position:               positionPda,
        vaultToken:             vaultTokenPda,
        vaultData:              vaultDataPda,
        vaultAuthority:         vaultAuthorityPda,
        priceFeed:              priceFeedKp.publicKey,
        liquidityPool:          liquidityPoolPda,
        usdcMint:               usdcMintKp.publicKey,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .signers([liquidatorKp])
      .rpc();

    // ── Position closed ─────────────────────────────────────────────────────
    const posAcct = await context.banksClient.getAccount(positionPda);
    assert.isNull(posAcct, "liquidated position account closed");

    // ── Liquidator bonus = 5% of collateral ────────────────────────────────
    // bonus = 100_000_000 * 500 / 10_000 = 5_000_000
    const liqBalAfter = await tokenBalance(context, liquidatorAta);
    assert.equal(
      Number(liqBalAfter - liqBalBefore),
      5_000_000,
      "liquidator receives 5% of collateral",
    );

    // ── OI cleared ─────────────────────────────────────────────────────────
    const mkt = await program.account.market.fetch(marketPda);
    assert.equal(mkt.totalLongOpenInterest.toNumber(), 0, "long OI cleared on liquidation");
  });

  // ─── 5. Reject stale oracle price ────────────────────────────────────────

  it("rejects open_position when the price feed is stale (age > 120 s)", async () => {
    // The last setPriceFeed call used clockTs as published_at.
    // Advance the clock by 121 s without refreshing the price feed,
    // so the price is now 121 s old — exceeds MAX_PRICE_AGE = 120.
    context.setClock(
      new Clock(500n, clockTs + 121n, 1n, 1n, clockTs + 121n),
    );

    const positionPda    = findPosition(traderKp.publicKey, marketPda);
    const userAccountPda = findUserAccount(traderKp.publicKey);

    // Build the tx but send via banksClient.tryProcessTransaction so we can
    // inspect raw log messages regardless of how bankrun wraps the error.
    const tx = await program.methods
      .openPosition({
        isLong:        true,
        collateral:    new BN(100_000_000),
        leverage:      2,
        maxEntryPrice: new BN("18446744073709551615"),
      })
      .accounts({
        owner:                  traderKp.publicKey,
        userAccount:            userAccountPda,
        userUsdcAccount:        traderAta,
        market:                 marketPda,
        position:               positionPda,
        vaultToken:             vaultTokenPda,
        vaultData:              vaultDataPda,
        priceFeed:              priceFeedKp.publicKey,
        liquidityPool:          liquidityPoolPda,
        usdcMint:               usdcMintKp.publicKey,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .signers([traderKp])
      .transaction();

    tx.recentBlockhash = context.lastBlockhash;
    tx.feePayer        = traderKp.publicKey;
    tx.sign(traderKp);

    const res = await context.banksClient.tryProcessTransaction(tx);

    assert.isNotNull(res.result, "transaction should have failed");
    const logs = res.meta?.logMessages ?? [];
    assert.isTrue(
      logs.some(l => l.includes("StalePriceFeed")),
      `expected StalePriceFeed in program logs, got: ${logs.join(" | ")}`,
    );
  });
});
