/**
 * GET /api/index-price?id={indexId}
 *
 * Fetches live prices for all 10 constituents of the requested index from
 * Steam Community Market in parallel, then returns the volume-weighted
 * average price (VWAP).
 *
 * Weight strategy:
 *   - Primary:  Steam's reported 24h volume for each constituent
 *   - Fallback: static weights defined in the index when volume = 0
 *
 * Next.js ISR revalidation: 30 seconds (matches the single-skin endpoint).
 */

import { NextRequest, NextResponse } from 'next/server';
import { INDEX_DEFINITIONS } from '@/lib/indexes';

// ── helpers ────────────────────────────────────────────────────────────────

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
  hashName:     string;
  price:        number;
  volume:       number;  // 24h Steam sales count
  staticWeight: number;
}

async function fetchConstituent(
  hashName: string,
  staticWeight: number,
): Promise<ConstituentPrice> {
  const url =
    'https://steamcommunity.com/market/priceoverview/?' +
    new URLSearchParams({
      appid:            '730',
      currency:         '1',           // USD
      market_hash_name: hashName,
    }).toString();

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://steamcommunity.com/market/',
    },
    next: { revalidate: 30 },
  });

  if (res.status === 429) throw new Error(`rate_limited: ${hashName}`);
  if (!res.ok)           throw new Error(`steam_http_${res.status}: ${hashName}`);

  const body = (await res.json()) as SteamPriceOverview;
  if (!body.success)     throw new Error(`steam_failed: ${hashName}`);

  const price = parseUSD(body.lowest_price) || parseUSD(body.median_price);
  if (!price) throw new Error(`zero_price: ${hashName}`);

  return { hashName, price, volume: parseVolume(body.volume), staticWeight };
}

// ── VWAP computation ───────────────────────────────────────────────────────

function computeVwap(constituents: ConstituentPrice[]): { price: number; volume: number } {
  const totalVolume = constituents.reduce((s, c) => s + c.volume, 0);

  let price: number;
  if (totalVolume > 0) {
    // Live volume-weighted average
    price = constituents.reduce((s, c) => s + c.price * c.volume, 0) / totalVolume;
  } else {
    // Static-weight fallback when Steam volume is unavailable
    const totalWeight = constituents.reduce((s, c) => s + c.staticWeight, 0);
    price = constituents.reduce((s, c) => s + c.price * (c.staticWeight / totalWeight), 0);
  }

  // Total notional volume across all constituents (USD)
  const volume = constituents.reduce((s, c) => s + c.price * c.volume, 0);

  return { price, volume };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const indexId = req.nextUrl.searchParams.get('id') ?? '';
  const def     = INDEX_DEFINITIONS[indexId];

  if (!def) {
    return NextResponse.json(
      { error: `Unknown index ID: ${indexId}` },
      { status: 400 },
    );
  }

  // Fetch all 10 constituents concurrently; capture failures without aborting
  const settled = await Promise.allSettled(
    def.constituents.map(c => fetchConstituent(c.hashName, c.staticWeight)),
  );

  const successful = settled
    .filter((r): r is PromiseFulfilledResult<ConstituentPrice> => r.status === 'fulfilled')
    .map(r => r.value);

  const failures = settled
    .filter(r => r.status === 'rejected')
    .map(r => (r as PromiseRejectedResult).reason as string);

  if (successful.length === 0) {
    return NextResponse.json(
      { error: 'All constituent fetches failed', failures },
      { status: 503 },
    );
  }

  const { price, volume } = computeVwap(successful);

  return NextResponse.json({
    indexId,
    name:               def.name,
    price,
    volume,
    constituentsUsed:   successful.length,
    totalConstituents:  def.constituents.length,
    failures:           failures.length > 0 ? failures : undefined,
    source:             'steam_vwap',
    fetchedAt:          Date.now(),
  });
}
