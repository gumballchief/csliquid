/**
 * GET /api/index-price?id={indexId}
 *
 * Fetches live prices for all constituents of the requested index from
 * Steam Community Market in parallel (5 s timeout each), then returns the
 * volume-weighted average price (VWAP).
 *
 * Falls back to last good cached value when all fetches fail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { INDEX_DEFINITIONS } from '@/lib/indexes';

const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL        = 30_000;

// ── Module-level cache ─────────────────────────────────────────────────────

interface CachedIndex { price: number; volume: number; ts: number }
const indexCache = new Map<string, CachedIndex>();

// ── helpers ────────────────────────────────────────────────────────────────

function parseUSD(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^\d.]/g, '')) || 0;
}

function parseVolume(s: string | null | undefined): number {
  if (!s) return 0;
  return parseInt(String(s).replace(/,/g, ''), 10) || 0;
}

// ── Steam price fetch with timeout ─────────────────────────────────────────

interface SteamPriceOverview {
  success:       boolean;
  lowest_price?: string;
  median_price?: string;
  volume?:       string;
}

interface ConstituentPrice {
  hashName:     string;
  price:        number;
  volume:       number;
  staticWeight: number;
}

async function fetchConstituent(hashName: string, staticWeight: number): Promise<ConstituentPrice> {
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const url =
      'https://steamcommunity.com/market/priceoverview/?' +
      new URLSearchParams({ appid: '730', currency: '1', market_hash_name: hashName }).toString();

    const res = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://steamcommunity.com/market/',
      },
      signal: ac.signal,
      next: { revalidate: 30 },
    });
    clearTimeout(timer);

    if (res.status === 429) throw new Error(`rate_limited: ${hashName}`);
    if (!res.ok)            throw new Error(`steam_http_${res.status}: ${hashName}`);

    const body = (await res.json()) as SteamPriceOverview;
    if (!body.success)      throw new Error(`steam_failed: ${hashName}`);

    const price = parseUSD(body.lowest_price) || parseUSD(body.median_price);
    if (!price) throw new Error(`zero_price: ${hashName}`);

    return { hashName, price, volume: parseVolume(body.volume), staticWeight };

  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? `timeout_5s: ${hashName}` : (err as Error).message;
    throw new Error(msg);
  }
}

// ── VWAP computation ───────────────────────────────────────────────────────

function computeVwap(constituents: ConstituentPrice[]): { price: number; volume: number } {
  const totalVolume = constituents.reduce((s, c) => s + c.volume, 0);

  let price: number;
  if (totalVolume > 0) {
    price = constituents.reduce((s, c) => s + c.price * c.volume, 0) / totalVolume;
  } else {
    const totalWeight = constituents.reduce((s, c) => s + c.staticWeight, 0);
    price = constituents.reduce((s, c) => s + c.price * (c.staticWeight / totalWeight), 0);
  }

  const volume = constituents.reduce((s, c) => s + c.price * c.volume, 0);
  return { price, volume };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const indexId = req.nextUrl.searchParams.get('id') ?? '';
  const def     = INDEX_DEFINITIONS[indexId];

  if (!def) {
    return NextResponse.json({ error: `Unknown index ID: ${indexId}` }, { status: 400 });
  }

  // Serve fresh server-side cache if available
  const hit = indexCache.get(indexId);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({
      indexId, name: def.name,
      price: hit.price, volume: hit.volume,
      source: 'steam_vwap_cached', fetchedAt: hit.ts,
    });
  }

  const settled = await Promise.allSettled(
    def.constituents.map(c => fetchConstituent(c.hashName, c.staticWeight)),
  );

  const successful = settled
    .filter((r): r is PromiseFulfilledResult<ConstituentPrice> => r.status === 'fulfilled')
    .map(r => r.value);

  const failures = settled
    .filter(r => r.status === 'rejected')
    .map(r => (r as PromiseRejectedResult).reason as string);

  if (failures.length > 0) {
    console.error(`[index-price] ${indexId}: ${failures.length}/${def.constituents.length} constituents failed:`, failures);
  }

  if (successful.length === 0) {
    // All failed — return stale cache rather than 503
    if (hit) {
      console.warn(`[index-price] ${indexId}: all fetches failed, returning stale cache`);
      return NextResponse.json({
        indexId, name: def.name,
        price: hit.price, volume: hit.volume,
        source: 'steam_vwap_stale', fetchedAt: hit.ts, stale: true,
      });
    }
    return NextResponse.json(
      { error: 'All constituent fetches failed', failures },
      { status: 503 },
    );
  }

  const { price, volume } = computeVwap(successful);

  indexCache.set(indexId, { price, volume, ts: Date.now() });

  return NextResponse.json({
    indexId,
    name:              def.name,
    price,
    volume,
    constituentsUsed:  successful.length,
    totalConstituents: def.constituents.length,
    failures:          failures.length > 0 ? failures : undefined,
    source:            'steam_vwap',
    fetchedAt:         Date.now(),
  });
}
