/**
 * GET /api/price/[index]
 *
 * Thin proxy to the oracle service (localhost:3001).  Returns the latest
 * volume-weighted average price computed from CSFloat + Skinport with
 * 2-sigma outlier rejection, refreshed every 60 seconds by the oracle cron.
 *
 * Response shape is compatible with /api/index-price so skinPriceService
 * can consume it without changes to the downstream data model.
 */

import { NextRequest, NextResponse } from 'next/server';
import { INDEX_DEFINITIONS } from '@/lib/indexes';

const ORACLE_URL       = process.env.ORACLE_URL ?? 'http://localhost:3001';
const FETCH_TIMEOUT_MS = 5_000;

export const dynamic = 'force-dynamic'; // always proxy live; oracle owns caching

// Module-level fallback cache so a dead oracle returns last good value
interface CachedOraclePrice { body: unknown; ts: number }
const oracleCache = new Map<string, CachedOraclePrice>();

export async function GET(
  _req: NextRequest,
  { params }: { params: { index: string } },
) {
  const indexId = params.index;

  if (!INDEX_DEFINITIONS[indexId]) {
    return NextResponse.json(
      { error: `Unknown index: ${indexId}` },
      { status: 400 },
    );
  }

  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const oracleRes = await fetch(
      `${ORACLE_URL}/api/price/${encodeURIComponent(indexId)}`,
      { headers: { Accept: 'application/json' }, signal: ac.signal },
    );
    clearTimeout(timer);

    const body = await oracleRes.json();

    if (oracleRes.ok) {
      oracleCache.set(indexId, { body, ts: Date.now() });
    }

    return NextResponse.json(body, { status: oracleRes.status });

  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? 'oracle_timeout_5s' : (err as Error).message;
    console.error(`[price/${indexId}] Oracle fetch failed:`, msg);

    const stale = oracleCache.get(indexId);
    if (stale) {
      console.warn(`[price/${indexId}] Returning stale oracle cache`);
      return NextResponse.json(stale.body);
    }

    return NextResponse.json(
      { error: 'Oracle service unavailable', detail: msg },
      { status: 503 },
    );
  }
}
