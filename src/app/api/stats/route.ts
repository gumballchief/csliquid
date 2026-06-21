export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

const EMPTY = {
  totalVolume: 0,
  totalTrades: 0,
  openPositions: 0,
  totalFees: 0,
  uniqueTraders: 0,
  aprPercent: 0,
};

export async function GET(): Promise<NextResponse> {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(EMPTY);
  }

  try {
    const { sql } = await import('@vercel/postgres');
    const result = await sql`
      SELECT
        COUNT(*)::int                                         AS total_trades,
        COALESCE(SUM(notional), 0)                           AS total_volume,
        COALESCE(SUM(fee), 0)                                AS total_fees,
        COUNT(DISTINCT wallet)::int                          AS unique_traders,
        COUNT(*) FILTER (WHERE status = 'open')::int         AS open_positions
      FROM positions
    `;
    const row = result.rows[0];
    return NextResponse.json({
      totalVolume:   Number(row?.total_volume   ?? 0),
      totalTrades:   Number(row?.total_trades   ?? 0),
      openPositions: Number(row?.open_positions ?? 0),
      totalFees:     Number(row?.total_fees     ?? 0),
      uniqueTraders: Number(row?.unique_traders ?? 0),
      aprPercent:    0,
    });
  } catch (err) {
    console.error('[stats]', err);
    return NextResponse.json(EMPTY);
  }
}
