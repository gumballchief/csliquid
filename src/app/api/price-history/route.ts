export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, createClient } from '@vercel/postgres';
import { initDb, db } from '@/lib/db';

export interface OHLCCandle { time: number; open: number; high: number; low: number; close: number }
export type PriceHistories = Record<'1H' | '4H' | '1D' | '1W', OHLCCandle[]>;

const RANGES = {
  '1H': { bucket: 5 * 60,    lookback: 8  * 3600 },
  '4H': { bucket: 5 * 60,    lookback: 30 * 3600 },
  '1D': { bucket: 2 * 3600,  lookback: 20 * 86400 },
  '1W': { bucket: 24 * 3600, lookback: 120 * 86400 },
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
  // Enforce minimum wick range (1%) and body size (0.4%) on every candle.
  // Steam prices barely move tick-to-tick, so without this every candle renders
  // as a flat dash regardless of whether there is one or many snapshots per bucket.
  let seed = 12345;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  for (const c of Array.from(map.values())) {
    const minWick = c.close * 0.01;
    const minBody = c.close * 0.004;
    if (c.high - c.low < minWick) {
      c.high = c.close + minWick;
      c.low  = c.close - minWick;
    }
    if (Math.abs(c.open - c.close) < minBody) {
      c.open = c.close + (rng() > 0.5 ? minBody : -minBody);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/** Random-walk backwards from currentPrice so pts[last].price === currentPrice */
function seedSnapshots(currentPrice: number, count: number, intervalSec: number) {
  const now = Math.floor(Date.now() / 1000);
  let p = currentPrice;
  let s = Math.round(currentPrice * 100) >>> 0;
  const rand = () => { s = Math.imul(s, 1664525) + 1013904223 >>> 0; return s / 0x100000000; };
  const pts: { price: number; ts: number }[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({ price: p, ts: now - i * intervalSec });
    p = Math.max(p * (1 + (rand() - 0.5) * 0.006), 0.01);
  }
  return pts.reverse(); // oldest first; newest === currentPrice
}

async function bulkInsert(rows: { skinId: string; price: number; ts: number }[]): Promise<void> {
  if (rows.length === 0) return;
  const params: (string | number)[] = [];
  const placeholders: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const b = i * 3;
    placeholders.push(`($${b + 1}, $${b + 2}, $${b + 3})`);
    params.push(rows[i].skinId, rows[i].price, new Date(rows[i].ts * 1000).toISOString());
  }
  const client = createClient();
  await client.connect();
  try {
    await client.query(
      `INSERT INTO price_history (skin_id, price, recorded_at) VALUES ${placeholders.join(',')}`,
      params,
    );
  } finally {
    await client.end();
  }
}

async function ensureSeed(skinId: string, currentPrice: number): Promise<void> {
  if (!currentPrice || currentPrice <= 0) return;
  const res = await sql`SELECT COUNT(*) AS cnt FROM price_history WHERE skin_id = ${skinId}`;
  if (Number(res.rows[0]?.cnt ?? 0) > 0) return; // already has data — never overwrite

  // First visit: seed 2160 × 5-min points (7.5 days) so 1H/4H charts have real bodies
  const pts = seedSnapshots(currentPrice, 2160, 5 * 60);
  const allRows = pts.map(p => ({ skinId, price: p.price, ts: p.ts }));
  for (let i = 0; i < allRows.length; i += 500) {
    await bulkInsert(allRows.slice(i, i + 500));
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: 'no_db' }, { status: 503 });
  }

  const skinId     = req.nextUrl.searchParams.get('skinId') ?? '';
  const priceParam = parseFloat(req.nextUrl.searchParams.get('price') ?? '0');

  if (!skinId) return NextResponse.json({ error: 'skinId required' }, { status: 400 });

  try {
    await initDb();

    if (priceParam > 0) {
      await ensureSeed(skinId, priceParam);
    }

    const since = new Date(Date.now() - 120 * 86400 * 1000);
    const rows  = await db.getPriceSnapshots(skinId, since);

    if (rows.length < 50) {
      return NextResponse.json({ empty: true });
    }

    const snaps = rows.map(r => ({
      price: Number(r.price),
      ts:    Math.floor(new Date(r.recorded_at).getTime() / 1000),
    }));

    // Patch the newest snapshot to the live price to eliminate end-of-chart cliffs
    if (snaps.length > 0 && priceParam > 0) snaps[snaps.length - 1].price = priceParam;

    const now = Math.floor(Date.now() / 1000);
    const histories: PriceHistories = {
      '1H': buildOHLC(snaps.filter(s => s.ts >= now - RANGES['1H'].lookback), RANGES['1H'].bucket),
      '4H': buildOHLC(snaps.filter(s => s.ts >= now - RANGES['4H'].lookback), RANGES['4H'].bucket),
      '1D': buildOHLC(snaps.filter(s => s.ts >= now - RANGES['1D'].lookback), RANGES['1D'].bucket),
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
