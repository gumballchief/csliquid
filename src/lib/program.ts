/**
 * Anchor program client for cs_skin_futures.
 *
 * IDL lives at src/lib/idl/cs_skin_futures.json.
 * Replace it with the `anchor build` output once the program is compiled:
 *   cp program/target/idl/cs_skin_futures.json src/lib/idl/cs_skin_futures.json
 *
 * All price/collateral values are stored on-chain with 6 decimal places:
 *   $42.50  →  42_500_000  (u64 lamports)
 */

import {
  AnchorProvider,
  BN,
  Idl,
  Program,
  type AnchorError,
} from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, type Connection, type ConfirmOptions } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import rawIdl from './idl/cs_skin_futures.json';
import { COMMITMENT, PROGRAM_ID, USDC_MINT } from './config';
import { getPriceFeed } from './markets';

// ── SPL constants (avoids @solana/spl-token dependency) ─────────────────────

export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1dWE',
);

// ── PDA helpers ──────────────────────────────────────────────────────────────

export function findMarketPda(priceFeed: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('market'), priceFeed.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

export function findPositionPda(owner: PublicKey, market: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), owner.toBuffer(), market.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

export function findUserAccountPda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_account'), owner.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

export function findVaultTokenPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), USDC_MINT.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

export function findVaultDataPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    PROGRAM_ID,
  );
  return pda;
}

export function findVaultAuthorityPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_authority')],
    PROGRAM_ID,
  );
  return pda;
}

export function findLiquidityPoolPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('liquidity_pool')],
    PROGRAM_ID,
  );
  return pda;
}

export function findLpPositionPda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('lp_position'), owner.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

// ── Program factory ──────────────────────────────────────────────────────────

const CONFIRM_OPTS: ConfirmOptions = { commitment: COMMITMENT };

export function getProgram(connection: Connection, wallet: WalletContextState): Program {
  if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
    throw new Error('Wallet not connected');
  }
  const provider = new AnchorProvider(
    connection,
    {
      publicKey:            wallet.publicKey,
      signTransaction:      wallet.signTransaction.bind(wallet),
      signAllTransactions:  wallet.signAllTransactions.bind(wallet),
    },
    CONFIRM_OPTS,
  );
  return new Program(rawIdl as unknown as Idl, provider);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a UI dollar amount (e.g. 42.5) to on-chain lamports (42_500_000). */
export const toUsdcLamports = (usd: number): BN =>
  new BN(Math.round(usd * 1_000_000));

/** Human-readable error message from an Anchor error or plain Error. */
export function extractErrorMessage(err: unknown): string {
  const anchorErr = err as AnchorError;
  if (anchorErr?.error?.errorMessage) return anchorErr.error.errorMessage;
  if (anchorErr?.message) return anchorErr.message;
  return 'Transaction failed — check your wallet and try again.';
}

// ── getUserUsdcAta (exported for pool page) ──────────────────────────────────

export function getUserUsdcAta(owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

// ── Transaction senders ──────────────────────────────────────────────────────

export interface OpenPositionArgs {
  skinId:       string;
  isLong:       boolean;
  collateral:   number;   // USD
  leverage:     number;
  markPrice:    number;   // USD — used for 1% slippage ceiling on longs
  slippagePct?: number;   // default 1
}

/**
 * Sends the `open_position` instruction.
 * Returns the confirmed transaction signature.
 */
export async function sendOpenPosition(
  program: Program,
  owner: PublicKey,
  args: OpenPositionArgs,
): Promise<string> {
  const { skinId, isLong, collateral, leverage, markPrice, slippagePct = 1 } = args;

  const priceFeed        = getPriceFeed(skinId);
  const market           = findMarketPda(priceFeed);
  const position         = findPositionPda(owner, market);
  const userAccount      = findUserAccountPda(owner);
  const vaultToken       = findVaultTokenPda();
  const vaultData        = findVaultDataPda();
  const vaultAuthority   = findVaultAuthorityPda();
  const userUsdcAccount  = getUserUsdcAta(owner);

  // For a long we cap at mark × (1 + slippage); for a short we floor — just
  // use a generous u64::MAX-equivalent for shorts since the constraint is a
  // ceiling check on the Rust side (longs want to avoid paying too much).
  const slippageMul         = isLong ? 1 + slippagePct / 100 : 1000;
  const maxEntryPrice        = toUsdcLamports(markPrice * slippageMul);

  return program.methods
    .openPosition({
      isLong,
      collateral:    toUsdcLamports(collateral),
      leverage,
      maxEntryPrice,
    })
    .accounts({
      owner,
      userAccount,
      userUsdcAccount,
      market,
      position,
      vaultToken,
      vaultData,
      vaultAuthority,
      priceFeed,
      liquidityPool:          findLiquidityPoolPda(),
      usdcMint:               USDC_MINT,
      tokenProgram:           TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:          SystemProgram.programId,
    })
    .rpc();
}

/**
 * Sends the `close_position` instruction.
 * Returns the confirmed transaction signature.
 */
export async function sendClosePosition(
  program: Program,
  owner: PublicKey,
  skinId: string,
): Promise<string> {
  const priceFeed        = getPriceFeed(skinId);
  const market           = findMarketPda(priceFeed);
  const position         = findPositionPda(owner, market);
  const userAccount      = findUserAccountPda(owner);
  const vaultToken       = findVaultTokenPda();
  const vaultData        = findVaultDataPda();
  const vaultAuthority   = findVaultAuthorityPda();
  const userUsdcAccount  = getUserUsdcAta(owner);

  return program.methods
    .closePosition()
    .accounts({
      owner,
      userAccount,
      userUsdcAccount,
      market,
      position,
      vaultToken,
      vaultData,
      vaultAuthority,
      priceFeed,
      liquidityPool:          findLiquidityPoolPda(),
      usdcMint:               USDC_MINT,
      tokenProgram:           TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:          SystemProgram.programId,
    })
    .rpc();
}

/**
 * Sends the `add_liquidity` instruction.
 * Returns the confirmed transaction signature.
 */
export async function sendAddLiquidity(
  program: Program,
  owner: PublicKey,
  amountUsd: number,
): Promise<string> {
  const liquidityPool  = findLiquidityPoolPda();
  const lpPosition     = findLpPositionPda(owner);
  const vaultToken     = findVaultTokenPda();
  const vaultData      = findVaultDataPda();
  const vaultAuthority = findVaultAuthorityPda();
  const userUsdcAccount = getUserUsdcAta(owner);

  return program.methods
    .addLiquidity(toUsdcLamports(amountUsd))
    .accounts({
      owner,
      lpPosition,
      liquidityPool,
      userUsdcAccount,
      vaultToken,
      vaultData,
      vaultAuthority,
      usdcMint:      USDC_MINT,
      tokenProgram:  TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

/**
 * Sends the `remove_liquidity` instruction.
 * Returns the confirmed transaction signature.
 */
export async function sendRemoveLiquidity(
  program: Program,
  owner: PublicKey,
  lpTokens: BN,
): Promise<string> {
  const liquidityPool  = findLiquidityPoolPda();
  const lpPosition     = findLpPositionPda(owner);
  const vaultToken     = findVaultTokenPda();
  const vaultData      = findVaultDataPda();
  const vaultAuthority = findVaultAuthorityPda();
  const userUsdcAccount = getUserUsdcAta(owner);

  return program.methods
    .removeLiquidity(lpTokens)
    .accounts({
      owner,
      lpPosition,
      liquidityPool,
      userUsdcAccount,
      vaultToken,
      vaultData,
      vaultAuthority,
      usdcMint:               USDC_MINT,
      tokenProgram:           TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:          SystemProgram.programId,
    })
    .rpc();
}
