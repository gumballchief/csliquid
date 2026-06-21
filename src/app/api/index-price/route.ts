/**
 * GET /api/index-price?id={indexId}
 *
 * Returns the live index price. AWP/AK47/Knife/Glove use average midpoint;
 * CS500 uses sum(midpoints) / CS500_DIVISOR (DJIA-style) with ±3% clamp + EWMA α=0.05.
 *
 * Falls back to last cached value when fetches fail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { INDEX_DEFINITIONS } from '@/lib/indexes';

const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL        = 30_000;

const CS500_DIVISOR = 3.5;

// ── Module-level cache ─────────────────────────────────────────────────────

interface CachedIndex { price: number; volume: number; ts: number }
const indexCache = new Map<string, CachedIndex>();

// ── Helpers ────────────────────────────────────────────────────────────────

function parseUSD(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^\d.]/g, '')) || 0;
}

function parseVolume(s: string | null | undefined): number {
  if (!s) return 0;
  return parseInt(String(s).replace(/,/g, ''), 10) || 0;
}

// ── Steam price fetch ──────────────────────────────────────────────────────

interface SteamPriceOverview {
  success:       boolean;
  lowest_price?: string;
  median_price?: string;
  volume?:       string;
}

interface ConstituentPrice {
  hashName: string;
  lowest:   number;
  median:   number;
  midpoint: number; // (lowest + median) / 2
  volume:   number;
}

async function fetchConstituent(hashName: string): Promise<ConstituentPrice> {
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

    const lowest = parseUSD(body.lowest_price);
    const median = parseUSD(body.median_price);

    if (lowest === 0 && median === 0) throw new Error(`zero_price: ${hashName}`);

    const lo = lowest || median;
    const hi = median || lowest;

    return { hashName, lowest: lo, median: hi, midpoint: (lo + hi) / 2, volume: parseVolume(body.volume) };

  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? `timeout_5s: ${hashName}` : (err as Error).message;
    throw new Error(msg);
  }
}

// ── Index computation ──────────────────────────────────────────────────────

function computeIndex(constituents: ConstituentPrice[]): { price: number; volume: number } {
  const midpoints = constituents.map(c => c.midpoint);
  const price  = midpoints.reduce((s, p) => s + p, 0) / midpoints.length;
  const volume = constituents.reduce((s, c) => s + c.lowest * c.volume, 0);
  return { price, volume };
}

function computeCs500(constituents: ConstituentPrice[], prevPrice: number): { price: number; volume: number } {
  const sum    = constituents.reduce((s, c) => s + c.midpoint, 0);
  const volume = constituents.reduce((s, c) => s + c.lowest * c.volume, 0);
  const raw    = sum / CS500_DIVISOR;
  let price    = raw;
  if (prevPrice > 0 && raw > 0) {
    const clamped = Math.min(Math.max(raw, prevPrice * 0.97), prevPrice * 1.03);
    price = prevPrice * 0.95 + clamped * 0.05;
  }
  return { price, volume };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const indexId = req.nextUrl.searchParams.get('id') ?? '';

  // CS500 uses its own 25-skin constituent list (not derived from the 4 base indices)
  const constituentHashNames = INDEX_DEFINITIONS[indexId]?.constituents.map(c => c.hashName) ?? null;

  if (!constituentHashNames) {
    return NextResponse.json({ error: `Unknown index ID: ${indexId}` }, { status: 400 });
  }

  const def = INDEX_DEFINITIONS[indexId] ?? INDEX_DEFINITIONS['awp-index'];

  // Serve fresh server-side cache if available
  const hit = indexCache.get(indexId);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({
      indexId, name: def.name,
      price: hit.price, volume: hit.volume,
      source: 'steam_midpoint_cached', fetchedAt: hit.ts,
    });
  }

  const settled = await Promise.allSettled(constituentHashNames.map(fetchConstituent));

  const successful = settled
    .filter((r): r is PromiseFulfilledResult<ConstituentPrice> => r.status === 'fulfilled')
    .map(r => r.value);

  const failures = settled
    .filter(r => r.status === 'rejected')
    .map(r => (r as PromiseRejectedResult).reason as string);

  if (failures.length > 0) {
    console.error(`[index-price] ${indexId}: ${failures.length}/${constituentHashNames.length} failed:`, failures);
  }

  if (successful.length === 0) {
    if (hit) {
      return NextResponse.json({
        indexId, name: def.name,
        price: hit.price, volume: hit.volume,
        source: 'steam_midpoint_stale', fetchedAt: hit.ts, stale: true,
      });
    }
    return NextResponse.json({ error: 'All constituent fetches failed', failures }, { status: 503 });
  }

  const prevPrice = hit?.price ?? 0;
  const { price, volume } = indexId === 'cs500-index'
    ? computeCs500(successful, prevPrice)
    : computeIndex(successful);
  indexCache.set(indexId, { price, volume, ts: Date.now() });

  return NextResponse.json({
    indexId,
    name:              def.name,
    price,
    volume,
    constituentsUsed:  successful.length,
    totalConstituents: constituentHashNames.length,
    failures:          failures.length > 0 ? failures : undefined,
    source:            'steam_midpoint',
    fetchedAt:         Date.now(),
  });
}
