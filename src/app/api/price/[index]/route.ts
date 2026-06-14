/**
 * GET /api/price/[index]
 *
 * Proxy to the oracle service (ORACLE_URL env var). On Vercel the oracle is
 * not co-located, so every request goes through the fallback chain:
 *
 *   1. Oracle (4 s timeout)
 *   2. Module-level in-memory cache (survives warm lambda re-use)
 *   3. Hardcoded baseline prices (always responds, never 503)
 *
 * The response shape is compatible with /api/index-price and what
 * skinPriceService expects: { price, volume, source, ... }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { INDEX_DEFINITIONS } from '@/lib/indexes';

export const dynamic = 'force-dynamic';

const ORACLE_URL       = process.env.ORACLE_URL ?? 'http://localhost:3001';
const FETCH_TIMEOUT_MS = 4_000;

// Reasonable baseline prices (USD) — static-weight VWAP estimates as of mid-2025.
// Used only when the oracle is unreachable AND no warm-lambda cache exists.
const FALLBACK_PRICES: Record<string, number> = {
  'awp-index':    55,
  'ak47-index':   12,
  'knife-index': 480,
  'glove-index': 280,
  'cs500-index':  65,
};

// Module-level: persists across requests within the same warm lambda instance.
interface CachedOraclePrice { body: unknown; ts: number }
const oracleCache = new Map<string, CachedOraclePrice>();

export async function GET(
  _req: NextRequest,
  { params }: { params: { index: string } },
) {
  const indexId = params.index;

  if (!INDEX_DEFINITIONS[indexId]) {
    return NextResponse.json({ error: `Unknown index: ${indexId}` }, { status: 400 });
  }

  // ── 1. Try oracle with 4 s hard timeout ────────────────────────────────────
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
      return NextResponse.json(body);
    }

    // Oracle returned a non-200 — fall through to cache / fallback
    console.error(`[price/${indexId}] Oracle returned ${oracleRes.status}`);

  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? 'oracle_timeout_4s' : (err as Error).message;
    console.error(`[price/${indexId}] Oracle fetch failed: ${msg}`);
  }

  // ── 2. Return stale lambda-local cache if available ────────────────────────
  const stale = oracleCache.get(indexId);
  if (stale) {
    console.warn(`[price/${indexId}] Returning stale oracle cache (age ${Math.round((Date.now() - stale.ts) / 1000)}s)`);
    return NextResponse.json(stale.body);
  }

  // ── 3. Hardcoded baseline — always responds, never kills the Vercel function
  const fallbackPrice = FALLBACK_PRICES[indexId] ?? 50;
  console.warn(`[price/${indexId}] Using hardcoded fallback price: $${fallbackPrice}`);

  return NextResponse.json({
    indexId,
    name:       INDEX_DEFINITIONS[indexId].name,
    price:      fallbackPrice,
    volume:     0,
    source:     'fallback',
    fetchedAt:  Date.now(),
  });
}
