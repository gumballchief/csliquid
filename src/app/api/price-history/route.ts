export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

const MARKETS = ['AWP', 'AK47', 'KNIFE', 'GLOVE', 'CS500'] as const;
type Market = (typeof MARKETS)[number];

const MARKET_TO_SKIN_ID: Record<Market, string> = {
  AWP:   'awp-index',
  AK47:  'ak47-index',
  KNIFE: 'knife-index',
  GLOVE: 'glove-index',
  CS500: 'cs500-index',
};

function kvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

const MAX_ENTRIES = 288;

// In-memory rolling price history (resets on cold start / serverless invocation)
const priceHistory: Record<Market, { price: number; timestamp: number }[]> = {
  AWP: [], AK47: [], KNIFE: [], GLOVE: [], CS500: [],
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const market = req.nextUrl.searchParams.get('market')?.toUpperCase() as Market | null;
  if (!market || !MARKETS.includes(market)) {
    return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
  }

  const history = priceHistory[market];
  return NextResponse.json({
    market,
    prices:     history.map(e => e.price),
    timestamps: history.map(e => e.timestamp),
    count:      history.length,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { market?: string; price?: number; timestamp?: number };
    const market = body.market?.toUpperCase() as Market | undefined;
    if (!market || !MARKETS.includes(market)) {
      return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
    }
    const price     = body.price ?? 0;
    const timestamp = body.timestamp ?? Math.floor(Date.now() / 1000);

    if (price <= 0) return NextResponse.json({ error: 'Invalid price' }, { status: 400 });

    const arr = priceHistory[market];
    arr.push({ price, timestamp });
    if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);

    // Write 24h-ago price snapshot to KV (set only if key absent, expires in 24h)
    // The change24h endpoint reads this to compute real 24h % change.
    if (kvAvailable()) {
      try {
        const skinId = MARKET_TO_SKIN_ID[market];
        const kvKey  = `price_24h:${skinId}`;
        const exists = await kv.get(kvKey);
        if (!exists) {
          await kv.set(kvKey, price, { ex: 86_400 });
        }
      } catch { /* KV write is best-effort */ }
    }

    return NextResponse.json({ ok: true, count: arr.length });
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
}
