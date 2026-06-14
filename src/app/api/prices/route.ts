import { NextResponse } from 'next/server';
import {
  BulkIndexPrices,
  getPriceCache,
  setPriceCache,
} from '@/lib/priceCache';

// Re-export so skinPriceService can import the type from here
export type { BulkIndexPrices };

export const dynamic    = 'force-dynamic';
export const maxDuration = 10; // Vercel cap: abort if Steam is totally unresponsive

const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL        = 30_000;

// ── Constituents ──────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface SkinResult {
  hashName: string;
  price:    number | null;
  field:    'lowest_price' | 'median_price' | null;
  source:   'steam' | 'failed';
  error?:   string;
}

interface SteamPriceOverview {
  success:       boolean;
  lowest_price?: string;
  median_price?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUSD(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^\d.]/g, '')) || 0;
}

function fail(hashName: string, error: string): SkinResult {
  return { hashName, price: null, field: null, source: 'failed', error };
}

// ── Steam fetch with 5 s timeout ──────────────────────────────────────────────

async function fetchSteamPrice(hashName: string): Promise<SkinResult> {
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const url =
      'https://steamcommunity.com/market/priceoverview/?' +
      new URLSearchParams({ appid: '730', currency: '1', market_hash_name: hashName });

    const res = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://steamcommunity.com/market/',
      },
      signal: ac.signal,
      next: { revalidate: 60 },
    });
    clearTimeout(timer);

    if (res.status === 429) return fail(hashName, 'steam_rate_limited');
    if (!res.ok)            return fail(hashName, `steam_http_${res.status}`);

    const body = (await res.json()) as SteamPriceOverview;
    if (!body.success) return fail(hashName, 'steam_success_false');

    const lowest = parseUSD(body.lowest_price);
    const median = parseUSD(body.median_price);

    if (lowest > 0) return { hashName, price: lowest, field: 'lowest_price', source: 'steam' };
    if (median > 0) return { hashName, price: median, field: 'median_price', source: 'steam' };
    return fail(hashName, 'steam_price_zero');

  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? 'steam_timeout_5s' : (err as Error).message;
    return fail(hashName, msg);
  }
}

// ── Index computation ─────────────────────────────────────────────────────────

async function computeIndex(indexId: string): Promise<{ price: number; results: SkinResult[] }> {
  const skins   = INDEX_SKINS[indexId] ?? [];
  const results = await Promise.all(skins.map(fetchSteamPrice));
  const prices  = results.filter(r => r.price !== null && r.price > 0).map(r => r.price as number);
  const price   = prices.length === 0 ? 0 : prices.reduce((a, b) => a + b, 0) / prices.length;
  return { price, results };
}

// ── Console audit ─────────────────────────────────────────────────────────────

const PAD = 44;

function printAudit(indexId: string, results: SkinResult[], finalPrice: number, fromCache: boolean) {
  const tag = `[PRICES/${indexId.replace('-index', '').toUpperCase()}]`;
  console.log(`${tag} ────────────────────────────────────────────────`);
  for (const r of results) {
    const name = r.hashName.length > PAD ? r.hashName.slice(0, PAD - 1) + '…' : r.hashName.padEnd(PAD);
    if (r.price !== null) {
      console.log(`${tag}   ✓  ${name}  $${r.price.toFixed(2).padStart(8)}  [Steam/${r.field === 'lowest_price' ? 'lowest' : 'median'}]`);
    } else {
      console.log(`${tag}   ✗  ${name}  FAILED  [${r.error}]`);
    }
  }
  const fetched = results.filter(r => r.price !== null).length;
  if (finalPrice > 0) {
    console.log(`${tag}   → $${finalPrice.toFixed(2)}  (${fetched}/${results.length} skins)${fromCache ? '  ← stale cache' : ''}`);
  } else {
    console.log(`${tag}   → UNAVAILABLE  (0/${results.length} skins, no cache)`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const cached = getPriceCache();
  // Return from shared cache if fresh — /api/price/[index] benefits from this too
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
    return NextResponse.json(cached);
  }

  try {
    console.log(`\n[PRICES] ══════════  AUDIT  ${new Date().toISOString()}  ══════════`);

    const [awpR, ak47R, knifeR, gloveR, cs500R] = await Promise.all([
      computeIndex('awp-index'),
      computeIndex('ak47-index'),
      computeIndex('knife-index'),
      computeIndex('glove-index'),
      computeIndex('cs500-index'),
    ]);

    const prev = cached;

    const awp   = awpR.price   > 0 ? awpR.price   : (prev?.awp   ?? 0);
    const ak47  = ak47R.price  > 0 ? ak47R.price  : (prev?.ak47  ?? 0);
    const knife = knifeR.price > 0 ? knifeR.price : (prev?.knife ?? 0);
    const glove = gloveR.price > 0 ? gloveR.price : (prev?.glove ?? 0);
    const cs500 = cs500R.price > 0 ? cs500R.price : (prev?.cs500 ?? 0);

    printAudit('awp-index',   awpR.results,   awp,   awpR.price   === 0 && !!prev?.awp);
    printAudit('ak47-index',  ak47R.results,  ak47,  ak47R.price  === 0 && !!prev?.ak47);
    printAudit('knife-index', knifeR.results, knife, knifeR.price === 0 && !!prev?.knife);
    printAudit('glove-index', gloveR.results, glove, gloveR.price === 0 && !!prev?.glove);
    printAudit('cs500-index', cs500R.results, cs500, cs500R.price === 0 && !!prev?.cs500);
    console.log(`[PRICES] ════════════════════════════════════════════════════\n`);

    const data: BulkIndexPrices = { awp, ak47, knife, glove, cs500, updatedAt: Date.now() };
    if (awp > 0 || ak47 > 0 || knife > 0 || glove > 0 || cs500 > 0) {
      setPriceCache(data);
    }

    return NextResponse.json(data);

  } catch (err) {
    console.error('[PRICES] Unexpected error in GET handler:', (err as Error).message, err);
    if (cached) {
      console.warn('[PRICES] Returning stale cache after unexpected error');
      return NextResponse.json(cached);
    }
    const empty: BulkIndexPrices = { awp: 0, ak47: 0, knife: 0, glove: 0, cs500: 0, updatedAt: Date.now() };
    return NextResponse.json(empty);
  }
}
