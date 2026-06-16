import * as cron from 'node-cron';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import fetch from 'cross-fetch';
import bs58 from 'bs58';
import * as path from 'path';
import * as fs from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL      = process.env.HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
const ADMIN_KP_B58 = process.env.ADMIN_KEYPAIR ?? '';
const TG_TOKEN     = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TG_CHAT_ID   = process.env.TELEGRAM_CHAT_ID ?? '';

if (!ADMIN_KP_B58) {
  console.error('ADMIN_KEYPAIR env var is required');
  process.exit(1);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROGRAM_ID  = new PublicKey('76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f');
const USDC_MINT   = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

const TOKEN_PROGRAM_ID             = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID  = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1dWE');

const LAMPORTS_PER_USD  = 1_000_000;    // 6-decimal fixed-point
const STALE_ORACLE_MS   = 10 * 60_000;  // 10 minutes

// When Steam price < 50% of baseline, push baseline instead of corrupted Steam price.
// This allows the oracle to recover from anomalous low prices without staying stuck.
const BASELINE_PRICES: Record<IndexId, number> = {
  AWP:   90,
  AK47:  400,
  KNIFE: 1200,
  GLOVE: 1050,
  CS500: 1400,
};

const INDEX_IDS = ['AWP', 'AK47', 'KNIFE', 'GLOVE', 'CS500'] as const;
type IndexId = (typeof INDEX_IDS)[number];


// ── PDA helpers ───────────────────────────────────────────────────────────────

function findPriceFeedPda(indexId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('price_feed'), Buffer.from(indexId)],
    PROGRAM_ID,
  );
  return pda;
}

function findMarketPda(priceFeed: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('market'), priceFeed.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

function findUserAccountPda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_account'), owner.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

function findVaultTokenPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), USDC_MINT.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

function findVaultDataPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    PROGRAM_ID,
  );
  return pda;
}

function findVaultAuthorityPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_authority')],
    PROGRAM_ID,
  );
  return pda;
}

function findLiquidityPoolPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('liquidity_pool')],
    PROGRAM_ID,
  );
  return pda;
}

function getUserUsdcAta(owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

// ── Solana + Anchor setup ─────────────────────────────────────────────────────

const adminKeypair = Keypair.fromSecretKey(bs58.decode(ADMIN_KP_B58));
const connection   = new Connection(RPC_URL, 'confirmed');

const wallet = {
  publicKey: adminKeypair.publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
    if (tx instanceof Transaction) {
      tx.partialSign(adminKeypair);
    } else {
      (tx as VersionedTransaction).sign([adminKeypair]);
    }
    return tx;
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
    for (const tx of txs) {
      if (tx instanceof Transaction) {
        tx.partialSign(adminKeypair);
      } else {
        (tx as VersionedTransaction).sign([adminKeypair]);
      }
    }
    return txs;
  },
};

const provider = new AnchorProvider(connection, wallet as any, {
  commitment:           'confirmed',
  preflightCommitment:  'confirmed',
});

const IDL_PATH = path.join(__dirname, '../idl/cs_skin_futures.json');
const idl      = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8')) as Idl;
const program  = new Program(idl, provider);

// ── Telegram alerts ───────────────────────────────────────────────────────────

async function alert(message: string): Promise<void> {
  console.error('[ALERT]', message);
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `🤖 CSLIQUID Keeper\n${message}` }),
    });
  } catch (err) {
    console.error('[ALERT] Telegram send failed:', err);
  }
}

// ── 1. PRICE PUSHER ───────────────────────────────────────────────────────────

interface ApiPrices {
  awp:       number;
  ak47:      number;
  knife:     number;
  glove:     number;
  cs500:     number;
  updatedAt: number;
}

const PRICES_API_URL        = 'https://cs-skin-futures.vercel.app/api/prices';
const PRICE_HISTORY_API_URL = 'https://cs-skin-futures.vercel.app/api/price-history';
const PRICES_CACHE_TTL = 2 * 60_000;  // 2 min

let _pricesCache:   ApiPrices | null = null;
let _pricesCacheTs = 0;

async function fetchIndexPrices(): Promise<ApiPrices> {
  if (_pricesCache && Date.now() - _pricesCacheTs < PRICES_CACHE_TTL) {
    return _pricesCache;
  }
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(PRICES_API_URL, { signal: ac.signal as any });
    clearTimeout(t);
    if (!res.ok) throw new Error(`prices API HTTP ${res.status}`);
    const data     = (await res.json()) as ApiPrices;
    _pricesCache   = data;
    _pricesCacheTs = Date.now();
    return data;
  } catch (err) {
    clearTimeout(t);
    throw err;
  }
}

const INDEX_TO_FIELD: Record<IndexId, keyof Omit<ApiPrices, 'updatedAt'>> = {
  'AWP':   'awp',
  'AK47':  'ak47',
  'KNIFE': 'knife',
  'GLOVE': 'glove',
  'CS500': 'cs500',
};

async function computeIndexPrice(indexId: IndexId): Promise<number> {
  const prices = await fetchIndexPrices();
  return prices[INDEX_TO_FIELD[indexId]] ?? 0;
}

async function runPricePusher(): Promise<void> {
  const results: Array<{ label: string; price: number }> = [];

  for (const indexId of INDEX_IDS) {
    try {
      const price = await computeIndexPrice(indexId);
      if (price <= 0) {
        console.warn(`[PRICE] Skipping ${indexId} — no price data available`);
        continue;
      }

      const baseline = BASELINE_PRICES[indexId];
      let priceToSend = price;
      if (baseline && price < baseline * 0.5) {
        console.warn(`[PRICE] ${indexId} Steam price $${price.toFixed(2)} < 50% of baseline $${baseline} — using baseline for oracle recovery`);
        priceToSend = baseline;
      }

      const priceFeed    = findPriceFeedPda(indexId);
      const onChainPrice = new BN(Math.round(priceToSend * LAMPORTS_PER_USD));

      await (program.methods as any)
        .pushPrice({ price: onChainPrice })
        .accounts({
          authority: adminKeypair.publicKey,
          priceFeed,
        })
        .rpc();

      results.push({ label: indexId, price: priceToSend });

      // Push to price-history API (best-effort)
      try {
        fetch(PRICE_HISTORY_API_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ market: indexId, price, timestamp: Math.floor(Date.now() / 1000) }),
        }).catch(() => {});
      } catch {}
    } catch (err) {
      console.error(`[PRICE] Failed to push ${indexId}:`, err);
      await alert(`push_price failed for ${indexId}: ${String(err)}`);
    }
  }

  if (results.length > 0) {
    const parts = results.map(r => `${r.label}=$${r.price.toFixed(2)}`).join(' ');
    console.log(`[PRICE] Oracle updated: ${parts}`);
  }
}

// ── 2. LIQUIDATION CHECKER ────────────────────────────────────────────────────

async function runLiquidationChecker(): Promise<void> {
  let allPositions: Array<{ publicKey: PublicKey; account: any }>;
  try {
    allPositions = await (program.account as any).position.all();
  } catch (err) {
    console.error('[LIQ] Failed to fetch positions:', err);
    return;
  }
  if (allPositions.length === 0) return;

  // Cache current on-chain prices for all indices
  const priceByFeed = new Map<string, BN>();
  for (const indexId of INDEX_IDS) {
    try {
      const feedPda = findPriceFeedPda(indexId);
      const feed    = await (program.account as any).priceFeed.fetch(feedPda);
      priceByFeed.set(feedPda.toString(), feed.price as BN);
    } catch {
      // price feed not yet initialized for this index
    }
  }

  // Precompute market PDAs so we can reverse-look up indexId per position
  const marketToIndex = new Map<string, IndexId>();
  for (const indexId of INDEX_IDS) {
    const feedPda   = findPriceFeedPda(indexId);
    const marketPda = findMarketPda(feedPda);
    marketToIndex.set(marketPda.toString(), indexId);
  }

  const liquidatorUsdcAccount = getUserUsdcAta(adminKeypair.publicKey);
  const vaultToken             = findVaultTokenPda();
  const vaultData              = findVaultDataPda();
  const vaultAuthority         = findVaultAuthorityPda();
  const liquidityPool          = findLiquidityPoolPda();

  for (const { publicKey: positionPda, account: pos } of allPositions) {
    try {
      const marketPda = pos.market as PublicKey;
      const indexId   = marketToIndex.get(marketPda.toString());
      if (!indexId) continue;

      const feedPda      = findPriceFeedPda(indexId);
      const currentPrice = priceByFeed.get(feedPda.toString());
      if (!currentPrice) continue;

      const liquidationPrice: BN = pos.liquidationPrice;
      const isLong: boolean       = pos.isLong;

      const liquidatable = isLong
        ? currentPrice.lte(liquidationPrice)
        : currentPrice.gte(liquidationPrice);
      if (!liquidatable) continue;

      const ownerPubkey  = pos.owner as PublicKey;
      const ownerAccount = findUserAccountPda(ownerPubkey);
      const collUsd      = (pos.collateral as BN).toNumber() / LAMPORTS_PER_USD;

      await (program.methods as any)
        .liquidate()
        .accounts({
          liquidator:             adminKeypair.publicKey,
          liquidatorUsdcAccount,
          ownerAccount,
          market:                 marketPda,
          position:               positionPda,
          vaultToken,
          vaultData,
          vaultAuthority,
          priceFeed:              feedPda,
          liquidityPool,
          usdcMint:               USDC_MINT,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .rpc();

      console.log(
        `[LIQ] Liquidated position: wallet=${ownerPubkey.toString().slice(0, 8)}… ` +
        `market=${indexId} collateral=$${collUsd.toFixed(2)}`,
      );
    } catch (err: any) {
      const msg = String(err);
      // Not a real error — position was closed/liquidated by another bot first
      if (msg.includes('PositionNotLiquidatable') || msg.includes('AccountNotInitialized')) continue;
      console.error(`[LIQ] Error liquidating ${positionPda.toString().slice(0, 8)}…:`, err);
    }
  }
}

// ── 3. FUNDING RATE SETTLER ───────────────────────────────────────────────────

async function runFundingSettler(): Promise<void> {
  let allPositions: Array<{ publicKey: PublicKey; account: any }>;
  try {
    allPositions = await (program.account as any).position.all();
  } catch (err) {
    console.error('[FUND] Failed to fetch positions:', err);
    return;
  }
  if (allPositions.length === 0) {
    console.log('[FUND] No open positions');
    return;
  }

  const marketToIndex = new Map<string, IndexId>();
  for (const indexId of INDEX_IDS) {
    const feedPda   = findPriceFeedPda(indexId);
    const marketPda = findMarketPda(feedPda);
    marketToIndex.set(marketPda.toString(), indexId);
  }

  let settled = 0;
  let notDue  = 0;

  for (const { publicKey: positionPda, account: pos } of allPositions) {
    try {
      const marketPda = pos.market as PublicKey;
      const indexId   = marketToIndex.get(marketPda.toString());
      if (!indexId) continue;

      const feedPda = findPriceFeedPda(indexId);
      const feed    = await (program.account as any).priceFeed.fetch(feedPda);
      const markPrice: BN = feed.price;

      const ownerPubkey  = pos.owner as PublicKey;
      const ownerAccount = findUserAccountPda(ownerPubkey);

      await (program.methods as any)
        .applyFunding({ markPrice })
        .accounts({
          authority:     adminKeypair.publicKey,
          market:        marketPda,
          position:      positionPda,
          ownerAccount,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      settled++;
    } catch (err: any) {
      const msg = String(err);
      if (msg.includes('FundingNotDue') || msg.includes('FundingTooEarly')) {
        notDue++;
        continue;
      }
      console.error(`[FUND] Error settling ${positionPda.toString().slice(0, 8)}…:`, err);
    }
  }

  console.log(`[FUND] Funding settled for ${settled} positions (${notDue} not yet due)`);
}

// ── 4. HEALTH MONITOR ─────────────────────────────────────────────────────────

async function runHealthMonitor(): Promise<void> {
  // RPC liveness check
  try {
    const slot = await Promise.race<number>([
      connection.getSlot(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5_000)),
    ]);
    console.log(`[HEALTH] RPC OK — slot ${slot}`);
  } catch (err) {
    await alert(`Solana RPC unreachable (${RPC_URL}): ${String(err)}`);
    return;
  }

  // Oracle staleness check
  const stale: string[] = [];

  for (const indexId of INDEX_IDS) {
    try {
      const feedPda = findPriceFeedPda(indexId);
      const feed    = await (program.account as any).priceFeed.fetch(feedPda);
      const publishedMs = (feed.publishedAt as BN).toNumber() * 1_000;
      const ageMs       = Date.now() - publishedMs;
      if (ageMs > STALE_ORACLE_MS) {
        stale.push(`${indexId} (${Math.round(ageMs / 60_000)}m ago)`);
      }
    } catch {
      stale.push(`${indexId} (not initialized)`);
    }
  }

  if (stale.length > 0) {
    await alert(`Stale oracle prices:\n${stale.join('\n')}`);
  } else {
    console.log('[HEALTH] All oracles are fresh');
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function wrap(label: string, task: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[${label}] Unhandled crash:`, err);
      await alert(`Keeper task "${label}" crashed: ${String(err)}`);
    }
  };
}

async function main(): Promise<void> {
  console.log('[KEEPER] Starting csliquid-keeper');
  console.log(`[KEEPER] Admin  : ${adminKeypair.publicKey.toString()}`);
  console.log(`[KEEPER] RPC    : ${RPC_URL}`);
  console.log(`[KEEPER] Program: ${PROGRAM_ID.toString()}`);
  console.log('');

  // Fire once immediately on startup
  await wrap('PRICE',  runPricePusher)();
  await wrap('HEALTH', runHealthMonitor)();

  // Every 60 s — push oracle prices
  cron.schedule('0 */1 * * * *', wrap('PRICE', runPricePusher));

  // Every 10 s — check for liquidatable positions
  cron.schedule('*/10 * * * * *', wrap('LIQ', runLiquidationChecker));

  // Every hour — settle funding for all positions
  cron.schedule('0 0 * * * *', wrap('FUND', runFundingSettler));

  // Every 5 min — health check + stale oracle alert
  cron.schedule('0 */5 * * * *', wrap('HEALTH', runHealthMonitor));

  console.log('[KEEPER] All tasks scheduled. Running...');
}

main().catch(err => {
  console.error('[KEEPER] Fatal startup error:', err);
  process.exit(1);
});
