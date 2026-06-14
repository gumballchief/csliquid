/**
 * GET /api/prices
 *
 * Bulk index price endpoint. Fetches real CS2 prices from the Steam Community
 * Market for the top-5 constituents of each index and returns a simple average.
 *
 * Every non-cached call prints a full per-skin audit to the server console:
 *   - Raw price returned by the API
 *   - Which API returned it (Steam) and which field (lowest_price / median_price)
 *   - Final averaged index price
 *   - Any skins that failed / fell back
 *
 * Server-side in-memory cache: 30 s.
 * Individual Steam fetches use next.revalidate = 60 (Vercel data cache) so
 * we never spam Steam even if the module-level cache is bypassed.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ── Constituents (top 5 by liquidity per index) ───────────────────────────────

const INDEX_SKINS: Record<string, string[]> = {
  'awp-index': [
    'AWP | Asiimov (Field-Tested)',
    'AWP | Redline (Field-Tested)',
    'AWP | Hyper Beast (Field-Tested)',
    'AWP | Dragon Lore (Field-Tested)',
    'AWP | Medusa (Minimal Wear)',
  ],
  'ak47-index': [
    'AK-47 | Redline (Field-Tested)',
    'AK-47 | Asiimov (Field-Tested)',
    'AK-47 | Vulcan (Minimal Wear)',
    'AK-47 | Fire Serpent (Field-Tested)',
    'AK-47 | Wild Lotus (Minimal Wear)',
  ],
  'knife-index': [
    '★ Karambit | Fade (Factory New)',
    '★ M9 Bayonet | Doppler (Factory New)',
    '★ Butterfly Knife | Fade (Factory New)',
    '★ Karambit | Doppler (Factory New)',
    '★ Bayonet | Tiger Tooth (Factory New)',
  ],
  'glove-index': [
    "★ Sport Gloves | Pandora's Box (Field-Tested)",
    '★ Specialist Gloves | Crimson Kimono (Field-Tested)',
    '★ Hand Wraps | Cobalt Skulls (Field-Tested)',
    '★ Moto Gloves | Spearmint (Field-Tested)',
    '★ Driver Gloves | Crimson Weave (Field-Tested)',
  ],
  'cs500-index': [
    'AWP | Dragon Lore (Factory New)',
    '★ Karambit | Fade (Factory New)',
    '★ M9 Bayonet | Doppler (Factory New)',
    'AK-47 | Wild Lotus (Factory New)',
    'M4A4 | Howl (Field-Tested)',
  ],
};

// ── Response type ─────────────────────────────────────────────────────────────

export interface BulkIndexPrices {
  awp:       number;
  ak47:      number;
  knife:     number;
  glove:     number;
  cs500:     number;
  updatedAt: number;
}

// ── Server-side in-memory cache ───────────────────────────────────────────────

let serverCache: { data: BulkIndexPrices; ts: number } | null = null;
const CACHE_TTL = 30_000;

// ── Per-skin fetch result ─────────────────────────────────────────────────────

interface SkinResult {
  hashName:  string;
  price:     number | null;
  field:     'lowest_price' | 'median_price' | null; // which field was used
  source:    'steam' | 'failed';
  error?:    string;
}

// ── Steam Community Market fetch ──────────────────────────────────────────────

interface SteamPriceOverview {
  success:       boolean;
  lowest_price?: string;
  median_price?: string;
  volume?:       string;
}

function parseUSD(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^\d.]/g, '')) || 0;
}

async function fetchSteamPrice(hashName: string): Promise<SkinResult> {
  try {
    const url =
      'https://steamcommunity.com/market/priceoverview/?' +
      new URLSearchParams({ appid: '730', currency: '1', market_hash_name: hashName });

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:            'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer:           'https://steamcommunity.com/market/',
      },
      next: { revalidate: 60 },
    });

    if (res.status === 429) {
      return { hashName, price: null, field: null, source: 'failed', error: 'steam_rate_limited' };
    }
    if (!res.ok) {
      return { hashName, price: null, field: null, source: 'failed', error: `steam_http_${res.status}` };
    }

    const body = (await res.json()) as SteamPriceOverview;
    if (!body.success) {
      return { hashName, price: null, field: null, source: 'failed', error: 'steam_success_false' };
    }

    const lowestRaw  = parseUSD(body.lowest_price);
    const medianRaw  = parseUSD(body.median_price);

    if (lowestRaw > 0) {
      return { hashName, price: lowestRaw, field: 'lowest_price', source: 'steam' };
    }
    if (medianRaw > 0) {
      return { hashName, price: medianRaw, field: 'median_price', source: 'steam' };
    }
    return { hashName, price: null, field: null, source: 'failed', error: 'steam_price_zero' };
  } catch (err) {
    return { hashName, price: null, field: null, source: 'failed', error: (err as Error).message };
  }
}

// ── Index computation + audit log ─────────────────────────────────────────────

const PAD = 42;

async function computeIndex(indexId: string): Promise<{ price: number; results: SkinResult[] }> {
  const skins   = INDEX_SKINS[indexId] ?? [];
  const results = await Promise.all(skins.map(fetchSteamPrice));

  const prices = results
    .filter((r): r is SkinResult & { price: number } => r.price !== null && r.price > 0)
    .map(r => r.price);

  const price = prices.length === 0
    ? 0
    : prices.reduce((a, b) => a + b, 0) / prices.length;

  return { price, results };
}

function printAudit(
  indexId:    string,
  results:    SkinResult[],
  finalPrice: number,
  usedCache:  boolean,
) {
  const tag     = `[PRICES/${indexId.replace('-index', '').toUpperCase()}]`;
  const fetched = results.filter(r => r.price !== null).length;
  const total   = results.length;

  console.log(`${tag} ──────────────────────────────────────────`);
  for (const r of results) {
    const name   = r.hashName.length > PAD ? r.hashName.slice(0, PAD - 1) + '…' : r.hashName.padEnd(PAD);
    if (r.price !== null) {
      const priceStr  = `$${r.price.toFixed(2)}`.padStart(9);
      const fieldStr  = r.field === 'lowest_price' ? 'lowest ' : 'median ';
      console.log(`${tag}   ✓  ${name} ${priceStr}  [Steam/${fieldStr}]`);
    } else {
      console.log(`${tag}   ✗  ${name}   FAILED  [${r.error ?? 'unknown'}]`);
    }
  }

  if (finalPrice > 0) {
    console.log(`${tag} → INDEX: $${finalPrice.toFixed(2)}  (${fetched}/${total} skins, simple avg)${usedCache ? '  ← USED STALE CACHE' : ''}`);
  } else {
    console.log(`${tag} → INDEX: UNAVAILABLE — all ${total} fetches failed`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  // Serve from in-memory cache when fresh (no Steam hit, no log)
  if (serverCache && Date.now() - serverCache.ts < CACHE_TTL) {
    return NextResponse.json(serverCache.data);
  }

  const ts = new Date().toISOString();
  console.log(`\n[PRICES] ═══════════════════  AUDIT  ${ts}  ═══════════════════`);

  const [awpResult, ak47Result, knifeResult, gloveResult, cs500Result] = await Promise.all([
    computeIndex('awp-index'),
    computeIndex('ak47-index'),
    computeIndex('knife-index'),
    computeIndex('glove-index'),
    computeIndex('cs500-index'),
  ]);

  const prev = serverCache?.data;

  // If live fetch returns 0, fall back to last good cached value
  const awp   = awpResult.price   > 0 ? awpResult.price   : (prev?.awp   ?? 0);
  const ak47  = ak47Result.price  > 0 ? ak47Result.price  : (prev?.ak47  ?? 0);
  const knife = knifeResult.price > 0 ? knifeResult.price : (prev?.knife ?? 0);
  const glove = gloveResult.price > 0 ? gloveResult.price : (prev?.glove ?? 0);
  const cs500 = cs500Result.price > 0 ? cs500Result.price : (prev?.cs500 ?? 0);

  printAudit('awp-index',   awpResult.results,   awp,   awpResult.price   === 0 && !!prev?.awp);
  printAudit('ak47-index',  ak47Result.results,  ak47,  ak47Result.price  === 0 && !!prev?.ak47);
  printAudit('knife-index', knifeResult.results, knife, knifeResult.price === 0 && !!prev?.knife);
  printAudit('glove-index', gloveResult.results, glove, gloveResult.price === 0 && !!prev?.glove);
  printAudit('cs500-index', cs500Result.results, cs500, cs500Result.price === 0 && !!prev?.cs500);
  console.log(`[PRICES] ════════════════════════════════════════════════════════\n`);

  const data: BulkIndexPrices = { awp, ak47, knife, glove, cs500, updatedAt: Date.now() };

  const anyFresh = awp > 0 || ak47 > 0 || knife > 0 || glove > 0 || cs500 > 0;
  if (anyFresh) serverCache = { data, ts: Date.now() };

  return NextResponse.json(data);
}
