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

// ── Skinport (bulk, cached) ────────────────────────────────────────────────

interface SkinportItem { market_hash_name: string; suggested_price: number | null; min_price: number | null }
let skinportCache: { items: SkinportItem[]; ts: number } | null = null;
const SKINPORT_TTL = 5 * 60_000;

async function fetchFromSkinport(hashName: string): Promise<number> {
  if (!skinportCache || Date.now() - skinportCache.ts > SKINPORT_TTL) {
    const ac    = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(
        'https://api.skinport.com/v1/items?app_id=730&currency=USD',
        { headers: { 'Accept': 'application/json' }, signal: ac.signal },
      );
      clearTimeout(timer);
      if (!res.ok) throw new Error(`skinport_http_${res.status}`);
      skinportCache = { items: await res.json() as SkinportItem[], ts: Date.now() };
    } catch (err) {
      clearTimeout(timer);
      throw new Error((err as Error).name === 'AbortError' ? 'skinport_timeout' : (err as Error).message);
    }
  }
  const item = skinportCache.items.find(i => i.market_hash_name === hashName);
  if (!item) throw new Error('skinport_not_found');
  const price = item.min_price ?? item.suggested_price ?? 0;
  if (!price) throw new Error('skinport_price_zero');
  return price;
}

// ── CSFloat Market (fallback) ──────────────────────────────────────────────

interface CSFloatListing { price: number }
interface CSFloatResponse { data: CSFloatListing[]; count: number }

async function fetchFromCSFloat(hashName: string): Promise<{ price: number; volume: number }> {
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const url =
      'https://csfloat.com/api/v0/listings?' +
      new URLSearchParams({ market_hash_name: hashName, limit: '10' }).toString();

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

// ── Price-history snapshot (fire-and-forget) ───────────────────────────────

function recordSnapshot(skinId: string, price: number): void {
  fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/price-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skinId, price }),
  }).catch(() => {});
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

  // Fetch Steam + Skinport in parallel; CSFloat is a serial fallback
  const [steamResult, skinportResult] = await Promise.allSettled([
    fetchFromSteam(hashName),
    fetchFromSkinport(hashName),
  ]);

  const prices: number[] = [];
  let volume = 0;

  if (steamResult.status === 'fulfilled') {
    prices.push(steamResult.value.price);
    volume = steamResult.value.volume;
  } else {
    console.warn(`[skin-price] Steam failed for ${hashName}:`, steamResult.reason?.message);
  }

  if (skinportResult.status === 'fulfilled' && skinportResult.value > 0) {
    prices.push(skinportResult.value);
  } else {
    console.warn(`[skin-price] Skinport failed for ${hashName}:`, (skinportResult as PromiseRejectedResult).reason?.message);
  }

  // If both primary sources failed, try CSFloat
  if (prices.length === 0) {
    try {
      const { price: cfPrice, volume: cfVol } = await fetchFromCSFloat(hashName);
      prices.push(cfPrice);
      volume = cfVol;
    } catch (floatErr) {
      console.error(`[skin-price] CSFloat also failed for ${hashName}:`, (floatErr as Error).message);
    }
  }

  if (prices.length > 0) {
    // Median of available prices
    const sorted = [...prices].sort((a, b) => a - b);
    const price  = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const median = steamResult.status === 'fulfilled' ? steamResult.value.median : price;

    const entry: CachedPrice = {
      price, median, volume,
      source: `${steamResult.status === 'fulfilled' ? 'steam' : ''}${skinportResult.status === 'fulfilled' ? '+skinport' : ''}`.replace(/^\+/, '') || 'csfloat',
      ts: Date.now(),
    };
    skinCache.set(skinId, entry);
    void recordSnapshot(skinId, price);
    return NextResponse.json({ skinId, hashName, ...entry, fetchedAt: entry.ts });
  }

  // All sources failed — return stale cache or zero
  if (hit) {
    console.warn(`[skin-price] All sources failed for ${hashName}, returning stale`);
    return NextResponse.json({ skinId, hashName, ...hit, fetchedAt: hit.ts, stale: true });
  }
  const approx = { price: 0, median: 0, volume: 0, source: 'unavailable', ts: Date.now() };
  skinCache.set(skinId, approx);
  return NextResponse.json({ skinId, hashName, ...approx, fetchedAt: approx.ts, stale: true });
}
