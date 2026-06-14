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

const ORACLE_URL = process.env.ORACLE_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic'; // always proxy live; oracle owns caching

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

  try {
    const oracleRes = await fetch(
      `${ORACLE_URL}/api/price/${encodeURIComponent(indexId)}`,
      { headers: { Accept: 'application/json' } },
    );

    const body = await oracleRes.json();

    return NextResponse.json(body, { status: oracleRes.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'Oracle service unavailable', detail: (err as Error).message },
      { status: 503 },
    );
  }
}
