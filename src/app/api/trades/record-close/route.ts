export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, db } from '@/lib/db';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  try {
    await initDb();
    const body = await req.json();
    const { wallet, market, close_tx, exit_price, realized_pnl } = body as Record<string, unknown>;
    if (!wallet || !market || !close_tx) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    await db.recordClosePosition(
      String(wallet),
      String(market),
      String(close_tx),
      Number(exit_price ?? 0),
      Number(realized_pnl ?? 0),
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[trades/record-close]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
