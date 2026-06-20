import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { INDEX_DEFINITIONS } from '@/lib/indexes';
import {
  BulkIndexPrices,
  getPriceCache,
  setPriceCache,
} from '@/lib/priceCache';

export type { BulkIndexPrices };

export const dynamic     = 'force-dynamic';
export const maxDuration = 10;

const SNAPSHOT_TTL_SEC = 90_000;
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL        = 30_000;

// ── Constituent skin lists derived from INDEX_DEFINITIONS ─────────────────────

const BASE_IDS = ['awp-index', 'ak47-index', 'knife-index', 'glove-index'] as const;

const INDEX_SKINS: Record<string, string[]> = {
  'awp-index':   INDEX_DEFINITIONS['awp-index'].constituents.map(c => c.hashName),
  'ak47-index':  INDEX_DEFINITIONS['ak47-index'].constituents.map(c => c.hashName),
  'knife-index': INDEX_DEFINITIONS['knife-index'].constituents.map(c => c.hashName),
  'glove-index': INDEX_DEFINITIONS['glove-index'].constituents.map(c => c.hashName),
};

// CS500 = every skin from all 4 base indices (40 total, deduped)
const CS500_SKINS = Array.from(new Set(BASE_IDS.flatMap(id => INDEX_SKINS[id])));

// ── Types ─────────────────────────────────────────────────────────────────────

interface SkinResult {
  hashName: string;
  lowest:   number;
  median:   number;
  midpoint: number; // (lowest + median) / 2
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

// ── Steam fetch ───────────────────────────────────────────────────────────────

async function fetchSteamPrice(hashName: string): Promise<SkinResult> {
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  const fail = (error: string): SkinResult =>
    ({ hashName, lowest: 0, median: 0, midpoint: 0, source: 'failed', error });

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

    if (res.status === 429) return fail('steam_rate_limited');
    if (!res.ok)            return fail(`steam_http_${res.status}`);

    const body = (await res.json()) as SteamPriceOverview;
    if (!body.success)      return fail('steam_success_false');

    const lowest = parseUSD(body.lowest_price);
    const median = parseUSD(body.median_price);

    if (lowest === 0 && median === 0) return fail('steam_price_zero');

    // Midpoint between floor listing price and median sale price.
    // If only one is available, use it directly (midpoint = that value).
    const lo = lowest || median;
    const hi = median || lowest;
    const midpoint = (lo + hi) / 2;

    return { hashName, lowest: lo, median: hi, midpoint, source: 'steam' };

  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? 'steam_timeout_5s' : (err as Error).message;
    return fail(msg);
  }
}

// ── Price computation ─────────────────────────────────────────────────────────

function avgMidpoint(results: SkinResult[]): number {
  const pts = results.filter(r => r.midpoint > 0).map(r => r.midpoint);
  if (pts.length === 0) return 0;
  return pts.reduce((a, b) => a + b, 0) / pts.length;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

const PAD = 46;

function printAudit(label: string, results: SkinResult[], finalPrice: number, stale: boolean) {
  const tag = `[PRICES/${label}]`;
  console.log(`${tag} ────────────────────────────────────────────`);
  for (const r of results) {
    const name = r.hashName.length > PAD ? r.hashName.slice(0, PAD - 1) + '…' : r.hashName.padEnd(PAD);
    if (r.midpoint > 0) {
      console.log(`${tag}   ✓  ${name}  lo=$${r.lowest.toFixed(2).padStart(8)}  mid=$${r.median.toFixed(2).padStart(8)}  →$${r.midpoint.toFixed(2).padStart(8)}`);
    } else {
      console.log(`${tag}   ✗  ${name}  FAILED  [${r.error}]`);
    }
  }
  const ok = results.filter(r => r.midpoint > 0).length;
  if (finalPrice > 0) {
    console.log(`${tag}   → $${finalPrice.toFixed(2)}  avg-midpoint  (${ok}/${results.length} skins)${stale ? '  ← stale cache' : ''}`);
  } else {
    console.log(`${tag}   → UNAVAILABLE  (0/${results.length} skins, no cache)`);
  }
}

// ── 24h KV snapshot ───────────────────────────────────────────────────────────

async function store24hSnapshot(prices: Record<string, number>): Promise<void> {
  try {
    await Promise.all(
      Object.entries(prices).map(([key, price]) =>
        price > 0
          ? kv.set(`price_24h:${key}`, price, { ex: SNAPSHOT_TTL_SEC, nx: true })
          : Promise.resolve(),
      ),
    );
  } catch { /* KV unavailable — silently skip */ }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const cached = getPriceCache();
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
    return NextResponse.json(cached);
  }

  try {
    console.log(`\n[PRICES] ══════════  AUDIT  ${new Date().toISOString()}  ══════════`);

    // Fetch all 40 unique skins in a single parallel batch
    const allResults = await Promise.all(CS500_SKINS.map(fetchSteamPrice));

    // Build O(1) lookup map
    const byHash = new Map<string, SkinResult>();
    CS500_SKINS.forEach((h, i) => byHash.set(h, allResults[i]));

    const pick = (skins: string[]): SkinResult[] =>
      skins.map(h => byHash.get(h) ?? { hashName: h, lowest: 0, median: 0, midpoint: 0, source: 'failed' as const, error: 'not_fetched' });

    const awpResults   = pick(INDEX_SKINS['awp-index']);
    const ak47Results  = pick(INDEX_SKINS['ak47-index']);
    const knifeResults = pick(INDEX_SKINS['knife-index']);
    const gloveResults = pick(INDEX_SKINS['glove-index']);
    const cs500Results = allResults; // all 40 skins

    const awpFresh   = avgMidpoint(awpResults);
    const ak47Fresh  = avgMidpoint(ak47Results);
    const knifeFresh = avgMidpoint(knifeResults);
    const gloveFresh = avgMidpoint(gloveResults);
    const cs500Fresh = avgMidpoint(cs500Results);

    const prev = cached;
    const awp   = awpFresh   > 0 ? awpFresh   : (prev?.awp   ?? 0);
    const ak47  = ak47Fresh  > 0 ? ak47Fresh  : (prev?.ak47  ?? 0);
    const knife = knifeFresh > 0 ? knifeFresh : (prev?.knife ?? 0);
    const glove = gloveFresh > 0 ? gloveFresh : (prev?.glove ?? 0);
    const cs500 = cs500Fresh > 0 ? cs500Fresh : (prev?.cs500 ?? 0);

    printAudit('AWP',   awpResults,   awp,   awpFresh   === 0 && !!prev?.awp);
    printAudit('AK47',  ak47Results,  ak47,  ak47Fresh  === 0 && !!prev?.ak47);
    printAudit('KNIFE', knifeResults, knife, knifeFresh === 0 && !!prev?.knife);
    printAudit('GLOVE', gloveResults, glove, gloveFresh === 0 && !!prev?.glove);
    printAudit('CS500', cs500Results, cs500, cs500Fresh === 0 && !!prev?.cs500);
    console.log(`[PRICES] ══════════════════════════════════════════════════\n`);

    const data: BulkIndexPrices = { awp, ak47, knife, glove, cs500, updatedAt: Date.now() };
    if (awp > 0 || ak47 > 0 || knife > 0 || glove > 0 || cs500 > 0) {
      setPriceCache(data);
      void store24hSnapshot({
        'awp-index':   awp,
        'ak47-index':  ak47,
        'knife-index': knife,
        'glove-index': glove,
        'cs500-index': cs500,
      });
    }

    return NextResponse.json(data);

  } catch (err) {
    console.error('[PRICES] Unexpected error:', (err as Error).message, err);
    if (cached) {
      console.warn('[PRICES] Returning stale cache after error');
      return NextResponse.json(cached);
    }
    const empty: BulkIndexPrices = { awp: 0, ak47: 0, knife: 0, glove: 0, cs500: 0, updatedAt: Date.now() };
    return NextResponse.json(empty);
  }
}
