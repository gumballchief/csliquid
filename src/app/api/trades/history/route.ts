export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, db } from '@/lib/db';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json([]);
  }
  try {
    await initDb();
    const wallet = req.nextUrl.searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10), 200);
    const history = await db.getTradeHistory(wallet, limit);
    return NextResponse.json(history);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[trades/history]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
