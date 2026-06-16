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
    const { wallet, market, direction, size, collateral, leverage, entry_price, liq_price, notional, fee, tx } = body as Record<string, unknown>;
    if (!wallet || !market || !direction || !tx) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const id = await db.recordOpenPosition({
      wallet:      String(wallet),
      market:      String(market),
      direction:   String(direction) as 'LONG' | 'SHORT',
      size:        Number(size),
      collateral:  Number(collateral),
      leverage:    Number(leverage),
      entry_price: Number(entry_price),
      liq_price:   Number(liq_price),
      notional:    Number(notional),
      fee:         Number(fee),
      open_tx:     String(tx),
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[trades/record-open]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
