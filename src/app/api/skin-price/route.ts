import { NextRequest, NextResponse } from 'next/server';
import { getHashName } from '@/lib/marketHashNames';

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
  const url =
    'https://steamcommunity.com/market/priceoverview/?' +
    new URLSearchParams({
      appid:            '730',
      currency:         '1',          // USD
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
    // Next.js ISR: revalidate cached response every 30 s
    next: { revalidate: 30 },
  });

  if (res.status === 429) throw new Error('steam_rate_limit');
  if (!res.ok)           throw new Error(`steam_http_${res.status}`);

  const body = (await res.json()) as SteamPriceOverview;
  if (!body.success)     throw new Error('steam_success_false');

  const price  = parseUSD(body.lowest_price) || parseUSD(body.median_price);
  const median = parseUSD(body.median_price)  || price;
  const volume = parseVolume(body.volume);

  if (!price) throw new Error('steam_price_zero');
  return { price, median, volume };
}

// ── CSFloat Market (fallback) ──────────────────────────────────────────────

interface CSFloatListing {
  price: number; // cents (USD × 100)
}

interface CSFloatResponse {
  data:  CSFloatListing[];
  count: number;
}

async function fetchFromCSFloat(hashName: string): Promise<{ price: number; volume: number }> {
  const url =
    'https://csfloat.com/api/v1/listings?' +
    new URLSearchParams({
      market_hash_name: hashName,
      sort_by:          'lowest_price',
      limit:            '5',
    }).toString();

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible)',
      'Accept':     'application/json',
    },
    next: { revalidate: 30 },
  });

  if (!res.ok) throw new Error(`csfloat_http_${res.status}`);

  const body = (await res.json()) as CSFloatResponse;
  if (!body.data?.length) throw new Error('csfloat_no_listings');

  // Lowest listing price (in cents → USD)
  const price  = body.data[0].price / 100;
  const volume = body.count;

  if (!price) throw new Error('csfloat_price_zero');
  return { price, volume };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const skinId   = req.nextUrl.searchParams.get('id') ?? '';
  const hashName = getHashName(skinId);

  if (!hashName) {
    return NextResponse.json(
      { error: `Unknown skin ID: ${skinId}` },
      { status: 400 },
    );
  }

  // Try Steam first
  try {
    const { price, median, volume } = await fetchFromSteam(hashName);
    return NextResponse.json({
      skinId, hashName,
      price, median, volume,
      source:    'steam',
      fetchedAt: Date.now(),
    });
  } catch (steamErr) {
    const steamMsg = (steamErr as Error).message;

    // Try CSFloat as fallback
    try {
      const { price, volume } = await fetchFromCSFloat(hashName);
      return NextResponse.json({
        skinId, hashName,
        price, median: price, volume,
        source:    'csfloat',
        fetchedAt: Date.now(),
      });
    } catch (floatErr) {
      const floatMsg = (floatErr as Error).message;

      // Both APIs failed — return 503 with diagnostic info
      return NextResponse.json(
        {
          error:  'All price sources failed',
          detail: { steam: steamMsg, csfloat: floatMsg },
        },
        { status: 503 },
      );
    }
  }
}
