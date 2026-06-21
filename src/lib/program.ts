/**
 * Anchor program client for cs_skin_futures.
 *
 * IDL lives at src/lib/idl/cs_skin_futures.json.
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
import { Keypair, PublicKey, SystemProgram, Transaction, type Connection, type ConfirmOptions } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import rawIdl from './idl/cs_skin_futures.json';
import { COMMITMENT, PROGRAM_ID, USDC_MINT } from './config';
import { getPriceFeed, INDEX_IDS, findPriceFeedPda } from './markets';

// ── SPL constants (avoids @solana/spl-token dependency) ─────────────────────

export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
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

// ── Transaction helpers ───────────────────────────────────────────────────────

/** Wraps an Anchor .rpc() Promise with a hard 30-second timeout. */
async function rpcWithTimeout(promise: Promise<string>, timeoutMs = 30_000): Promise<string> {
  return Promise.race([
    promise,
    new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error('Transaction timed out — check your wallet and try again')),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Polls getSignatureStatus every 1.5 s until the tx is confirmed or 30 s pass.
 * Replaces connection.confirmTransaction() which drops silently on devnet.
 */
async function pollConfirmation(connection: Connection, sig: string): Promise<void> {
  const POLL_MS    = 1_500;
  const TIMEOUT_MS = 30_000;
  const deadline   = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const { value } = await connection.getSignatureStatus(sig, { searchTransactionHistory: false });
      if (value) {
        if (value.err) throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
        if (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized') return;
      }
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.startsWith('Transaction failed')) throw err;
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  throw new Error('Transaction timed out — check your wallet and try again');
}

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
  markPrice:    number;   // USD — used for slippage ceiling on longs
  slippagePct?: number;   // default 1
}

/**
 * Opens a position using the user's vault balance as collateral.
 * No wallet ATA transfer — deducts directly from UserAccount.usdc_balance.
 */
export async function sendOpenPosition(
  program: Program,
  owner: PublicKey,
  args: OpenPositionArgs,
): Promise<string> {
  const { skinId, isLong, collateral, leverage, markPrice, slippagePct = 1 } = args;

  const priceFeed  = getPriceFeed(skinId);
  const market     = findMarketPda(priceFeed);
  const position   = findPositionPda(owner, market);
  const userAccount = findUserAccountPda(owner);

  const slippageMul   = isLong ? 1 + slippagePct / 100 : 1000;
  const maxEntryPrice = toUsdcLamports(markPrice * slippageMul);

  return rpcWithTimeout(
    program.methods
      .openPosition({
        isLong,
        collateral:    toUsdcLamports(collateral),
        leverage,
        maxEntryPrice,
      })
      .accounts({
        owner,
        userAccount,
        market,
        position,
        priceFeed,
        liquidityPool: findLiquidityPoolPda(),
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );
}

/**
 * Like sendOpenPosition but signs with a local Keypair (generated/guest wallets).
 * No wallet popup required.
 */
export async function sendOpenPositionKeypair(
  connection: Connection,
  signer: Keypair,
  args: OpenPositionArgs,
): Promise<string> {
  const { skinId, isLong, collateral, leverage, markPrice, slippagePct = 1 } = args;
  const owner = signer.publicKey;

  const priceFeed   = getPriceFeed(skinId);
  const market      = findMarketPda(priceFeed);
  const position    = findPositionPda(owner, market);
  const userAccount = findUserAccountPda(owner);

  const slippageMul   = isLong ? 1 + slippagePct / 100 : 1000;
  const maxEntryPrice = toUsdcLamports(markPrice * slippageMul);

  const walletLike = {
    publicKey:           signer.publicKey,
    signTransaction:     async (tx: Transaction) => { tx.partialSign(signer); return tx; },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach(t => t.partialSign(signer));
      return txs;
    },
  };
  const provider = new AnchorProvider(connection, walletLike as never, CONFIRM_OPTS);
  const program  = new Program(rawIdl as unknown as Idl, provider);

  const ix = await program.methods
    .openPosition({ isLong, collateral: toUsdcLamports(collateral), leverage, maxEntryPrice })
    .accounts({
      owner,
      userAccount,
      market,
      position,
      priceFeed,
      liquidityPool: findLiquidityPoolPda(),
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: signer.publicKey }).add(ix);
  tx.sign(signer);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await pollConfirmation(connection, sig);
  return sig;
}

/**
 * Closes a position. Net return (collateral ± PnL − fees) is credited to
 * UserAccount.usdc_balance — the user withdraws separately.
 */
export async function sendClosePosition(
  program: Program,
  owner: PublicKey,
  skinId: string,
): Promise<string> {
  const priceFeed   = getPriceFeed(skinId);
  const market      = findMarketPda(priceFeed);
  const position    = findPositionPda(owner, market);
  const userAccount = findUserAccountPda(owner);

  return rpcWithTimeout(
    program.methods
      .closePosition()
      .accounts({
        owner,
        userAccount,
        market,
        position,
        priceFeed,
        liquidityPool: findLiquidityPoolPda(),
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );
}

/**
 * Like sendClosePosition but signs with a local Keypair (generated/guest wallets).
 */
export async function sendClosePositionKeypair(
  connection: Connection,
  signer: Keypair,
  skinId: string,
): Promise<string> {
  const owner = signer.publicKey;

  const priceFeed   = getPriceFeed(skinId);
  const market      = findMarketPda(priceFeed);
  const position    = findPositionPda(owner, market);
  const userAccount = findUserAccountPda(owner);

  const walletLike = {
    publicKey:           signer.publicKey,
    signTransaction:     async (tx: Transaction) => { tx.partialSign(signer); return tx; },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach(t => t.partialSign(signer));
      return txs;
    },
  };
  const provider = new AnchorProvider(connection, walletLike as never, CONFIRM_OPTS);
  const program  = new Program(rawIdl as unknown as Idl, provider);

  const ix = await program.methods
    .closePosition()
    .accounts({
      owner,
      userAccount,
      market,
      position,
      priceFeed,
      liquidityPool: findLiquidityPoolPda(),
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: signer.publicKey }).add(ix);
  tx.sign(signer);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await pollConfirmation(connection, sig);
  return sig;
}

/**
 * Sends the `add_liquidity` instruction.
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

  return rpcWithTimeout(
    program.methods
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
      .rpc(),
  );
}

/**
 * Sends the `remove_liquidity` instruction.
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

  return rpcWithTimeout(
    program.methods
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
      .rpc(),
  );
}

const ASSOC_TOKEN_PROGRAM = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

/**
 * Read the user's deposited USDC from their on-chain UserAccount PDA.
 * Returns null when the account doesn't exist yet (no deposit made).
 *
 * Account layout: discriminator(8) + owner pubkey(32) + usdc_balance u64(8)
 */
export async function fetchUserAccountBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<number | null> {
  const info = await connection.getAccountInfo(findUserAccountPda(owner));
  if (!info || info.data.length < 48) return null;
  const raw = new BN(Array.from(info.data.slice(40, 48)), 'le');
  return raw.toNumber() / 1_000_000;
}

/**
 * Sends the `deposit` instruction — moves USDC from wallet ATA → vault.
 * Creates the user_account PDA on first deposit (init_if_needed).
 */
export async function sendDeposit(
  program: Program,
  owner: PublicKey,
  amountUsd: number,
): Promise<string> {
  return rpcWithTimeout(
    program.methods
      .deposit(toUsdcLamports(amountUsd))
      .accounts({
        owner,
        userAccount:            findUserAccountPda(owner),
        userUsdcAccount:        getUserUsdcAta(owner),
        vaultToken:             findVaultTokenPda(),
        vaultData:              findVaultDataPda(),
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOC_TOKEN_PROGRAM,
        systemProgram:          SystemProgram.programId,
      })
      .rpc(),
  );
}

/**
 * Like sendDeposit but signs with a local Keypair (generated/guest wallets).
 * Creates the UserAccount PDA on first deposit (init_if_needed in the program).
 */
export async function sendDepositKeypair(
  connection: Connection,
  signer: Keypair,
  amountUsd: number,
): Promise<string> {
  const owner = signer.publicKey;
  const walletLike = {
    publicKey:           owner,
    signTransaction:     async (tx: Transaction) => { tx.partialSign(signer); return tx; },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach(t => t.partialSign(signer));
      return txs;
    },
  };
  const provider = new AnchorProvider(connection, walletLike as never, CONFIRM_OPTS);
  const program  = new Program(rawIdl as unknown as Idl, provider);

  return rpcWithTimeout(
    program.methods
      .deposit(toUsdcLamports(amountUsd))
      .accounts({
        owner,
        userAccount:            findUserAccountPda(owner),
        userUsdcAccount:        getUserUsdcAta(owner),
        vaultToken:             findVaultTokenPda(),
        vaultData:              findVaultDataPda(),
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOC_TOKEN_PROGRAM,
        systemProgram:          SystemProgram.programId,
      })
      .rpc(),
  );
}

/**
 * Sends the `withdraw` instruction — moves USDC from vault → wallet ATA.
 */
export async function sendWithdraw(
  program: Program,
  owner: PublicKey,
  amountUsd: number,
): Promise<string> {
  return rpcWithTimeout(
    program.methods
      .withdraw(toUsdcLamports(amountUsd))
      .accounts({
        owner,
        userAccount:            findUserAccountPda(owner),
        userUsdcAccount:        getUserUsdcAta(owner),
        vaultToken:             findVaultTokenPda(),
        vaultData:              findVaultDataPda(),
        vaultAuthority:         findVaultAuthorityPda(),
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOC_TOKEN_PROGRAM,
        systemProgram:          SystemProgram.programId,
      })
      .rpc(),
  );
}

/**
 * Like sendWithdraw but signs with a local Keypair (generated/session wallets).
 */
export async function sendWithdrawKeypair(
  connection: Connection,
  signer: Keypair,
  amountUsd: number,
): Promise<string> {
  const owner = signer.publicKey;
  const walletLike = {
    publicKey:           owner,
    signTransaction:     async (tx: Transaction) => { tx.partialSign(signer); return tx; },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach(t => t.partialSign(signer));
      return txs;
    },
  };
  const provider = new AnchorProvider(connection, walletLike as never, CONFIRM_OPTS);
  const prog     = new Program(rawIdl as unknown as Idl, provider);

  return rpcWithTimeout(
    prog.methods
      .withdraw(toUsdcLamports(amountUsd))
      .accounts({
        owner,
        userAccount:            findUserAccountPda(owner),
        userUsdcAccount:        getUserUsdcAta(owner),
        vaultToken:             findVaultTokenPda(),
        vaultData:              findVaultDataPda(),
        vaultAuthority:         findVaultAuthorityPda(),
        usdcMint:               USDC_MINT,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOC_TOKEN_PROGRAM,
        systemProgram:          SystemProgram.programId,
      })
      .rpc(),
  );
}

// ── LP position / wallet balance helpers ────────────────────────────────────

export interface LpPositionData {
  lpTokens:    number;   // USDC-denominated LP units (raw / 1_000_000)
  depositedAt: Date;
  exists:      true;
}

const LP_POSITION_DISC = [105, 241, 37, 200, 224, 2, 252, 90];

/** Read the user's LpPosition PDA: owner(8+32) → lp_tokens(8) → deposited_at(8) → bump(1). */
export async function fetchLpPosition(
  connection: Connection,
  owner: PublicKey,
): Promise<LpPositionData | null> {
  const info = await connection.getAccountInfo(findLpPositionPda(owner));
  if (!info || info.data.length < 57) return null;
  const data = info.data;
  if (!LP_POSITION_DISC.every((b, i) => data[i] === b)) return null;
  const lpTokens   = new BN(Array.from(data.slice(40, 48)), 'le').toNumber() / 1_000_000;
  const depositedAt = new BN(Array.from(data.slice(48, 56)), 'le').toNumber();
  return { lpTokens, depositedAt: new Date(depositedAt * 1_000), exists: true };
}

/** Read the USDC balance in the user's wallet ATA (not the trading vault). */
export async function fetchWalletUsdcBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<number | null> {
  const ata  = getUserUsdcAta(owner);
  const info = await connection.getAccountInfo(ata);
  if (!info || info.data.length < 72) return null;
  return new BN(Array.from(info.data.slice(64, 72)), 'le').toNumber() / 1_000_000;
}

/** Add liquidity via session keypair — pulls USDC from wallet ATA into the LP pool. */
export async function sendAddLiquidityKeypair(
  connection: Connection,
  signer: Keypair,
  amountUsd: number,
): Promise<string> {
  const owner = signer.publicKey;
  const walletLike = {
    publicKey:           owner,
    signTransaction:     async (tx: Transaction) => { tx.partialSign(signer); return tx; },
    signAllTransactions: async (txs: Transaction[]) => { txs.forEach(t => t.partialSign(signer)); return txs; },
  };
  const provider = new AnchorProvider(connection, walletLike as never, CONFIRM_OPTS);
  const prog     = new Program(rawIdl as unknown as Idl, provider);

  const ix = await prog.methods
    .addLiquidity(toUsdcLamports(amountUsd))
    .accounts({
      owner,
      lpPosition:    findLpPositionPda(owner),
      liquidityPool: findLiquidityPoolPda(),
      userUsdcAccount: getUserUsdcAta(owner),
      vaultToken:    findVaultTokenPda(),
      vaultData:     findVaultDataPda(),
      vaultAuthority: findVaultAuthorityPda(),
      usdcMint:      USDC_MINT,
      tokenProgram:  TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner }).add(ix);
  tx.sign(signer);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await pollConfirmation(connection, sig);
  return sig;
}

/** Remove liquidity via session keypair — redeems LP tokens for USDC into wallet ATA. */
export async function sendRemoveLiquidityKeypair(
  connection: Connection,
  signer: Keypair,
  lpTokensBN: BN,
): Promise<string> {
  const owner = signer.publicKey;
  const walletLike = {
    publicKey:           owner,
    signTransaction:     async (tx: Transaction) => { tx.partialSign(signer); return tx; },
    signAllTransactions: async (txs: Transaction[]) => { txs.forEach(t => t.partialSign(signer)); return txs; },
  };
  const provider = new AnchorProvider(connection, walletLike as never, CONFIRM_OPTS);
  const prog     = new Program(rawIdl as unknown as Idl, provider);

  const ix = await prog.methods
    .removeLiquidity(lpTokensBN)
    .accounts({
      owner,
      lpPosition:    findLpPositionPda(owner),
      liquidityPool: findLiquidityPoolPda(),
      userUsdcAccount: getUserUsdcAta(owner),
      vaultToken:    findVaultTokenPda(),
      vaultData:     findVaultDataPda(),
      vaultAuthority: findVaultAuthorityPda(),
      usdcMint:               USDC_MINT,
      tokenProgram:           TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:          SystemProgram.programId,
    })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner }).add(ix);
  tx.sign(signer);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await pollConfirmation(connection, sig);
  return sig;
}

// ── On-chain position reading ─────────────────────────────────────────────────

/** Display name for each on-chain index. */
const SKIN_LABELS: Record<string, string> = {
  AWP:   'AWP Index',
  AK47:  'AK-47 Index',
  KNIFE: 'Knife Index',
  GLOVE: 'Glove Index',
  CS500: 'CS500 Index',
};

/** skinId formats used by the price service (awp-index, ak47-index, …) */
export const INDEX_TO_SKIN_ID: Record<string, string> = {
  AWP:   'awp-index',
  AK47:  'ak47-index',
  KNIFE: 'knife-index',
  GLOVE: 'glove-index',
  CS500: 'cs500-index',
};

/** Deserialized on-chain Position account. */
export interface OnChainPosition {
  positionPda:      string;
  skinId:           string;   // INDEX_ID format: 'AWP', 'AK47', …
  priceSkinId:      string;   // price-service format: 'awp-index', …
  skinLabel:        string;
  side:             'long' | 'short';
  collateral:       number;   // USD
  size:             number;   // base units
  notional:         number;   // USD
  entryPrice:       number;   // USD
  liquidationPrice: number;   // USD
  leverage:         number;
  openedAt:         Date;
}

const POSITION_DISC = [170, 188, 143, 228, 122, 64, 247, 208];

function readU64Le(data: Uint8Array, offset: number): number {
  return new BN(Array.from(data.slice(offset, offset + 8)), 'le').toNumber();
}

/**
 * Fetch all open positions for `owner` by checking every configured market.
 * Derives Position PDAs for all 5 markets, batch-fetches, and deserialises
 * accounts that carry the correct discriminator.
 */
export async function fetchOnChainPositions(
  connection: Connection,
  owner: PublicKey,
): Promise<OnChainPosition[]> {
  const entries = INDEX_IDS.map(indexId => {
    const priceFeed = findPriceFeedPda(indexId);
    const market    = findMarketPda(priceFeed);
    const pda       = findPositionPda(owner, market);
    return { indexId, pda };
  });

  console.log('[positions] owner:', owner.toBase58());
  console.log('[positions] PDAs:', entries.map(e => `${e.indexId}=${e.pda.toBase58()}`));
  const accounts = await connection.getMultipleAccountsInfo(entries.map(e => e.pda));

  entries.forEach((e, i) => {
    const acct = accounts[i];
    if (acct) {
      console.log(`[positions] ${e.indexId} found ${acct.data.length}b disc=${JSON.stringify(Array.from(acct.data.slice(0, 8)))}`);
    } else {
      console.log(`[positions] ${e.indexId} — no account`);
    }
  });

  const positions: OnChainPosition[] = [];
  for (let i = 0; i < accounts.length; i++) {
    const acct = accounts[i];
    if (!acct || acct.data.length < 138) continue;

    const data = acct.data;
    if (!POSITION_DISC.every((b, j) => data[j] === b)) {
      console.log(`[positions] ${entries[i].indexId} discriminator mismatch: got ${JSON.stringify(Array.from(data.slice(0,8)))} expected ${JSON.stringify(POSITION_DISC)}`);
      continue;
    }

    // Binary layout (IDL Position struct):
    //   offset  0: discriminator (8)
    //   offset  8: owner pubkey (32)
    //   offset 40: market pubkey (32)
    //   offset 72: is_long bool (1)
    //   offset 73: collateral u64 (8)
    //   offset 81: size u64 (8)
    //   offset 89: notional u64 (8)
    //   offset 97: entry_price u64 (8)
    //   offset 105: liquidation_price u64 (8)
    //   offset 113: opened_at i64 (8)
    const isLong     = data[72] === 1;
    const collateral = readU64Le(data, 73)  / 1_000_000;
    const size       = readU64Le(data, 81)  / 1_000_000;
    const notional   = readU64Le(data, 89)  / 1_000_000;
    const entryPrice = readU64Le(data, 97)  / 1_000_000;
    const liqPrice   = readU64Le(data, 105) / 1_000_000;
    const openedAt   = readU64Le(data, 113);  // Unix seconds

    const { indexId, pda } = entries[i];
    const leverage = collateral > 0 ? Math.round(notional / collateral) : 1;

    positions.push({
      positionPda:      pda.toBase58(),
      skinId:           indexId,
      priceSkinId:      INDEX_TO_SKIN_ID[indexId] ?? indexId,
      skinLabel:        SKIN_LABELS[indexId]       ?? indexId,
      side:             isLong ? 'long' : 'short',
      collateral,
      size,
      notional,
      entryPrice,
      liquidationPrice: liqPrice,
      leverage,
      openedAt:         new Date(openedAt * 1_000),
    });
  }

  return positions;
}
