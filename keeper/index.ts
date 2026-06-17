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

const PRICE_HISTORY_API_URL = 'https://cs-skin-futures.vercel.app/api/price-history';

// ── Index constituents ─────────────────────────────────────────────────────────

const INDEX_CONSTITUENTS: Record<IndexId, string[]> = {
  AWP: [
    'AWP | Asiimov (Field-Tested)',
    'AWP | Fever Dream (Field-Tested)',
    'AWP | Atheris (Field-Tested)',
    'AWP | Hyper Beast (Field-Tested)',
    'AWP | Neo-Noir (Field-Tested)',
    'AWP | Wildfire (Field-Tested)',
    'AWP | Oni Taiji (Field-Tested)',
    'AWP | Medusa (Field-Tested)',
    'AWP | Lightning Strike (Factory New)',
    'AWP | Dragon Lore (Factory New)',
  ],
  AK47: [
    'AK-47 | Redline (Field-Tested)',
    'AK-47 | Bloodsport (Field-Tested)',
    'AK-47 | Asiimov (Field-Tested)',
    'AK-47 | The Empress (Field-Tested)',
    'AK-47 | Aquamarine Revenge (Field-Tested)',
    'AK-47 | Neon Rider (Well-Worn)',
    'AK-47 | Vulcan (Field-Tested)',
    'AK-47 | Case Hardened (Field-Tested)',
    'AK-47 | Fire Serpent (Field-Tested)',
    'AK-47 | Wild Lotus (Well-Worn)',
  ],
  KNIFE: [
    '★ Karambit | Fade (Factory New)',
    '★ Butterfly Knife | Fade (Factory New)',
    '★ M9 Bayonet | Fade (Factory New)',
    '★ Karambit | Doppler (Factory New)',
    '★ Butterfly Knife | Doppler (Factory New)',
    '★ Bayonet | Fade (Factory New)',
    '★ Flip Knife | Fade (Factory New)',
    '★ Karambit | Tiger Tooth (Factory New)',
    '★ Butterfly Knife | Tiger Tooth (Factory New)',
    '★ Skeleton Knife | Fade (Factory New)',
  ],
  GLOVE: [
    "★ Sport Gloves | Pandora's Box (Field-Tested)",
    '★ Sport Gloves | Vice (Field-Tested)',
    '★ Specialist Gloves | Crimson Kimono (Well-Worn)',
    '★ Driver Gloves | King Snake (Field-Tested)',
    '★ Hand Wraps | Cobalt Skulls (Field-Tested)',
    '★ Moto Gloves | Spearmint (Field-Tested)',
    '★ Sport Gloves | Amphibious (Well-Worn)',
    '★ Hydra Gloves | Case Hardened (Well-Worn)',
    '★ Bloodhound Gloves | Charred (Well-Worn)',
    '★ Specialist Gloves | Lt. Commander (Well-Worn)',
  ],
  CS500: [
    'AWP | Asiimov (Field-Tested)',
    'AK-47 | Redline (Field-Tested)',
    '★ Karambit | Fade (Factory New)',
    "★ Sport Gloves | Pandora's Box (Field-Tested)",
    'M4A4 | Howl (Field-Tested)',
    'AWP | Dragon Lore (Field-Tested)',
    'AK-47 | Fire Serpent (Field-Tested)',
    'Glock-18 | Fade (Factory New)',
    'M4A1-S | Knight (Factory New)',
    'Desert Eagle | Blaze (Factory New)',
  ],
};

// ── Source fetchers ────────────────────────────────────────────────────────────

async function fetchCSFloatPrices(hashName: string): Promise<number[]> {
  const params = new URLSearchParams({
    market_hash_name: hashName, type: 'buy_now', sort_by: 'lowest_price', limit: '50',
  });
  const res = await fetch(`https://csfloat.com/api/v1/listings?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible)', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  } as any);
  if (!res.ok) throw new Error(`csfloat_${res.status}`);
  const body = (await res.json()) as { data?: Array<{ price: number }> };
  return (body.data ?? []).map(l => l.price / 100);
}

let _skinportCache: Map<string, { min: number; max: number }> | null = null;
let _skinportCacheTs = 0;

async function fetchSkinportMap(): Promise<Map<string, { min: number; max: number }>> {
  if (_skinportCache && Date.now() - _skinportCacheTs < 5 * 60_000) return _skinportCache;
  const res = await fetch('https://api.skinport.com/v1/items?app_id=730&currency=USD', {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  } as any);
  if (!res.ok) throw new Error(`skinport_${res.status}`);
  const items = (await res.json()) as Array<{
    market_hash_name: string; min_price: number | null; max_price: number | null; mean_price: number | null;
  }>;
  const map = new Map<string, { min: number; max: number }>();
  for (const item of items) {
    const min = item.min_price ?? item.mean_price;
    const max = item.max_price ?? item.mean_price;
    if (min && min > 0) map.set(item.market_hash_name, { min, max: max && max > 0 ? max : min });
  }
  _skinportCache   = map;
  _skinportCacheTs = Date.now();
  return map;
}

async function fetchSteamLowest(hashName: string): Promise<number> {
  const params = new URLSearchParams({ appid: '730', market_hash_name: hashName, currency: '1' });
  const res = await fetch(`https://steamcommunity.com/market/priceoverview/?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
    signal: AbortSignal.timeout(8_000),
  } as any);
  if (!res.ok) throw new Error(`steam_${res.status}`);
  const body = (await res.json()) as { success: boolean; lowest_price?: string; median_price?: string };
  if (!body.success) throw new Error('steam_no_data');
  const parse = (s?: string) => s ? parseFloat(s.replace(/[^0-9.]/g, '')) || 0 : 0;
  return parse(body.lowest_price) || parse(body.median_price);
}

// ── EWMA smoother (α=0.15 → ~6 cycles to absorb a step change) ────────────────

const EWMA_ALPHA = 0.15;
const ewmaState: Record<IndexId, number> = { AWP: 0, AK47: 0, KNIFE: 0, GLOVE: 0, CS500: 0 };

function applyEwma(indexId: IndexId, sample: number): number {
  if (ewmaState[indexId] <= 0) { ewmaState[indexId] = sample; return sample; }
  ewmaState[indexId] = EWMA_ALPHA * sample + (1 - EWMA_ALPHA) * ewmaState[indexId];
  return ewmaState[indexId];
}

// ── Main price computation ─────────────────────────────────────────────────────

async function computeIndexPrice(indexId: IndexId): Promise<number> {
  const skins = INDEX_CONSTITUENTS[indexId];
  const allPrices: number[] = [];

  // Fetch Skinport in one bulk call (shared across all indices per cycle via cache)
  let spMap = new Map<string, { min: number; max: number }>();
  try { spMap = await fetchSkinportMap(); } catch {}

  // Per-constituent: collect prices from CSFloat, Skinport, Steam
  await Promise.allSettled(skins.map(async (hashName) => {
    // CSFloat — individual listings
    try {
      const cfPrices = await fetchCSFloatPrices(hashName);
      allPrices.push(...cfPrices.filter(p => p > 0));
    } catch {}

    // Skinport — min and max for this skin
    const sp = spMap.get(hashName);
    if (sp) {
      allPrices.push(sp.min);
      if (sp.max > sp.min) allPrices.push(sp.max);
    }

    // Steam — lowest listing
    try {
      const steamLow = await fetchSteamLowest(hashName);
      if (steamLow > 0) allPrices.push(steamLow);
    } catch {}
  }));

  if (allPrices.length === 0) throw new Error(`no_prices: ${indexId}`);

  const globalMin = Math.min(...allPrices);
  const globalMax = Math.max(...allPrices);
  const midPrice  = (globalMin + globalMax) / 2;

  console.log(
    `[PRICE] ${indexId}: ${allPrices.length} data points, ` +
    `low=$${globalMin.toFixed(2)} high=$${globalMax.toFixed(2)} mid=$${midPrice.toFixed(2)}`,
  );

  return applyEwma(indexId, midPrice);
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

      const priceFeed    = findPriceFeedPda(indexId);
      const onChainPrice = new BN(Math.round(price * LAMPORTS_PER_USD));

      await (program.methods as any)
        .pushPrice({ price: onChainPrice })
        .accounts({
          authority: adminKeypair.publicKey,
          priceFeed,
        })
        .rpc();

      results.push({ label: indexId, price });

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
