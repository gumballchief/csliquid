export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, db as pgPool } from '@vercel/postgres';
import { initDb, db } from '@/lib/db';

export interface OHLCCandle { time: number; open: number; high: number; low: number; close: number }
export type PriceHistories = Record<'1H' | '4H' | '1D' | '1W', OHLCCandle[]>;

// candle bucket sizes (seconds) and lookback windows
const RANGES = {
  '1H': { bucket: 5 * 60,      lookback: 8  * 3600 },
  '4H': { bucket: 5 * 60,      lookback: 30 * 3600 },
  '1D': { bucket: 2 * 3600,    lookback: 20 * 86400 },
  '1W': { bucket: 24 * 3600,   lookback: 120 * 86400 },
} as const;

function buildOHLC(
  snapshots: { price: number; ts: number }[],
  bucketSec: number,
): OHLCCandle[] {
  const map = new Map<number, OHLCCandle>();
  for (const { price, ts } of snapshots) {
    const bucket = Math.floor(ts / bucketSec) * bucketSec;
    const c = map.get(bucket);
    if (!c) {
      map.set(bucket, { time: bucket, open: price, high: price, low: price, close: price });
    } else {
      c.high  = Math.max(c.high, price);
      c.low   = Math.min(c.low,  price);
      c.close = price;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

function seedSnapshots(currentPrice: number, count: number, intervalSec: number) {
  const now = Math.floor(Date.now() / 1000);
  const pts: { price: number; ts: number }[] = [];
  let p = currentPrice;

  // Random walk backwards from current price using LCG for determinism
  let s = Math.round(currentPrice * 100) >>> 0;
  const rand = () => { s = Math.imul(s, 1664525) + 1013904223 >>> 0; return s / 0x100000000; };

  for (let i = count - 1; i >= 0; i--) {
    pts.push({ price: p, ts: (now - i * intervalSec) });
    const move = (rand() - 0.5) * 0.018;
    const pull  = ((currentPrice - p) / currentPrice) * 0.04;
    p = Math.max(p * (1 + move + pull), 0.01);
  }
  return pts;
}

async function ensureSeed(skinId: string, currentPrice: number): Promise<void> {
  if (!currentPrice || currentPrice <= 0) return;

  // Check if existing seed is stale (price diverged >30% from current)
  const count = await db.countPriceSnapshots(skinId);
  if (count >= 200) {
    const recent = await sql`
      SELECT price FROM price_history
      WHERE skin_id = ${skinId}
      ORDER BY recorded_at DESC LIMIT 1
    `;
    const lastPrice = Number(recent.rows[0]?.price ?? 0);
    if (lastPrice > 0) {
      const divergence = Math.abs(currentPrice - lastPrice) / lastPrice;
      if (divergence < 0.30) return; // seed is still close enough
    }
    // Price moved >30% — delete stale seed and reseed from current price
    await sql`DELETE FROM price_history WHERE skin_id = ${skinId}`;
  }

  // Generate 2160 points at 1-hour intervals = ~90 days
  const pts = seedSnapshots(currentPrice, 2160, 3600);

  // Bulk insert via parameterized multi-row VALUES — single round-trip,
  // compatible with @vercel/postgres (no array params needed).
  const params: (string | number)[] = [];
  const rows: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const base = i * 3;
    rows.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(skinId, pts[i].price, new Date(pts[i].ts * 1000).toISOString());
  }
  const client = await pgPool.connect();
  try {
    await client.query(
      `INSERT INTO price_history (skin_id, price, recorded_at) VALUES ${rows.join(',')}`,
      params,
    );
  } finally {
    client.release();
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: 'no_db' }, { status: 503 });
  }

  const skinId       = req.nextUrl.searchParams.get('skinId') ?? '';
  const priceParam   = parseFloat(req.nextUrl.searchParams.get('price') ?? '0');
  const seedOnly     = req.nextUrl.searchParams.get('seed') === '1';

  if (!skinId) return NextResponse.json({ error: 'skinId required' }, { status: 400 });

  try {
    await initDb();

    // Always check for stale seed when caller sends the live price.
    // This ensures the chart reseeds itself if the price drifts >30% from
    // the seeded baseline (e.g. AK-47 drops from $430 → $223).
    if (priceParam > 0) {
      await ensureSeed(skinId, priceParam);
    }

    if (seedOnly) {
      return NextResponse.json({ ok: true });
    }

    // Fetch enough snapshots to cover the longest range (1W = 120 days)
    const since = new Date(Date.now() - 120 * 86400 * 1000);
    const rows  = await db.getPriceSnapshots(skinId, since);

    if (rows.length === 0) {
      return NextResponse.json({ empty: true });
    }

    const snaps = rows.map(r => ({
      price: Number(r.price),
      ts:    Math.floor(new Date(r.recorded_at).getTime() / 1000),
    }));

    const histories: PriceHistories = {
      '1H': buildOHLC(snaps.filter(s => s.ts >= Math.floor(Date.now() / 1000) - RANGES['1H'].lookback), RANGES['1H'].bucket),
      '4H': buildOHLC(snaps.filter(s => s.ts >= Math.floor(Date.now() / 1000) - RANGES['4H'].lookback), RANGES['4H'].bucket),
      '1D': buildOHLC(snaps.filter(s => s.ts >= Math.floor(Date.now() / 1000) - RANGES['1D'].lookback), RANGES['1D'].bucket),
      '1W': buildOHLC(snaps, RANGES['1W'].bucket),
    };

    return NextResponse.json(histories);
  } catch (err) {
    console.error('[price-history]', (err as Error).message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.POSTGRES_URL) return NextResponse.json({ ok: true, skipped: true });
  try {
    await initDb();
    const { skinId, price } = await req.json() as { skinId?: string; price?: number };
    if (!skinId || !price || price <= 0) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    await db.recordPriceSnapshot(skinId, price);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
