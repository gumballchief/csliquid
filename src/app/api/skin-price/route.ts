import { NextRequest, NextResponse } from 'next/server';
import { getHashName } from '@/lib/marketHashNames';

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL        = 5 * 60_000;   // 5 minutes — reduces Steam rate-limit hits
const STALE_TTL        = 60 * 60_000;  // 1 hour — serve stale before giving up

// ── Module-level fallback cache ────────────────────────────────────────────
// Returns last good price if both APIs fail so the client never sees a 503.

interface CachedPrice { price: number; median: number; volume: number; source: string; ts: number }
const skinCache = new Map<string, CachedPrice>();

// ── helpers ────────────────────────────────────────────────────────────────

function parseUSD(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^\d.]/g, '')) || 0;
}

function parseVolume(s: string | null | undefined): number {
  if (!s) return 0;
  return parseInt(String(s).replace(/,/g, ''), 10) || 0;
}

// ── Steam Community Market ─────────────────────────────────────────────────

interface SteamPriceOverview {
  success:       boolean;
  lowest_price?: string;
  median_price?: string;
  volume?:       string;
}

async function fetchFromSteam(hashName: string): Promise<{ price: number; median: number; volume: number }> {
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

    if (res.status === 429) throw new Error('steam_rate_limit');
    if (!res.ok)            throw new Error(`steam_http_${res.status}`);

    const body = (await res.json()) as SteamPriceOverview;
    if (!body.success)      throw new Error('steam_success_false');

    const price  = parseUSD(body.lowest_price) || parseUSD(body.median_price);
    const median = parseUSD(body.median_price) || price;
    const volume = parseVolume(body.volume);

    if (!price) throw new Error('steam_price_zero');
    return { price, median, volume };

  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? 'steam_timeout_5s' : (err as Error).message;
    throw new Error(msg);
  }
}

// ── CSFloat Market (fallback) ──────────────────────────────────────────────

interface CSFloatListing { price: number }
interface CSFloatResponse { data: CSFloatListing[]; count: number }

async function fetchFromCSFloat(hashName: string): Promise<{ price: number; volume: number }> {
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const url =
      'https://csfloat.com/api/v1/listings?' +
      new URLSearchParams({ market_hash_name: hashName, sort_by: 'lowest_price', limit: '5' }).toString();

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)', 'Accept': 'application/json' },
      signal: ac.signal,
      next: { revalidate: 30 },
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`csfloat_http_${res.status}`);

    const body = (await res.json()) as CSFloatResponse;
    if (!body.data?.length) throw new Error('csfloat_no_listings');

    const price = body.data[0].price / 100;
    if (!price) throw new Error('csfloat_price_zero');
    return { price, volume: body.count };

  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? 'csfloat_timeout_5s' : (err as Error).message;
    throw new Error(msg);
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const skinId   = req.nextUrl.searchParams.get('id') ?? '';
  const hashName = getHashName(skinId);

  if (!hashName) {
    // Don't reflect raw user input in error message to prevent response injection
    return NextResponse.json({ error: 'Unknown skin ID' }, { status: 400 });
  }

  // Check fresh server-side cache first
  const hit = skinCache.get(skinId);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({ skinId, hashName, ...hit, fetchedAt: hit.ts });
  }

  // Try Steam first
  try {
    const { price, median, volume } = await fetchFromSteam(hashName);
    const entry: CachedPrice = { price, median, volume, source: 'steam', ts: Date.now() };
    skinCache.set(skinId, entry);
    return NextResponse.json({ skinId, hashName, price, median, volume, source: 'steam', fetchedAt: entry.ts });
  } catch (steamErr) {
    const steamMsg = (steamErr as Error).message;
    console.error(`[skin-price] Steam failed for ${hashName}:`, steamMsg);

    // Try CSFloat as fallback
    try {
      const { price, volume } = await fetchFromCSFloat(hashName);
      const entry: CachedPrice = { price, median: price, volume, source: 'csfloat', ts: Date.now() };
      skinCache.set(skinId, entry);
      return NextResponse.json({ skinId, hashName, price, median: price, volume, source: 'csfloat', fetchedAt: entry.ts });
    } catch (floatErr) {
      const floatMsg = (floatErr as Error).message;
      console.error(`[skin-price] CSFloat failed for ${hashName}:`, floatMsg);

      // Return stale cache rather than 503 — never return an error status
      if (hit) {
        console.warn(`[skin-price] Returning stale cache for ${hashName} (steam: ${steamMsg}, csfloat: ${floatMsg})`);
        return NextResponse.json({ skinId, hashName, ...hit, fetchedAt: hit.ts, stale: true });
      }

      // No cache at all — return approx price so the UI doesn't break
      const approx = { price: 0, median: 0, volume: 0, source: 'unavailable', ts: Date.now() };
      skinCache.set(skinId, approx);
      console.error(`[skin-price] No data for ${hashName}, returning zero (steam: ${steamMsg}, csfloat: ${floatMsg})`);
      return NextResponse.json({ skinId, hashName, ...approx, fetchedAt: approx.ts, stale: true });
    }
  }
}
