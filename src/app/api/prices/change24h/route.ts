export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const market = req.nextUrl.searchParams.get('market') ?? 'awp-index';
  try {
    const price24h = await kv.get<number>(`price_24h:${market}`);
    return NextResponse.json({ market, price24h: price24h ?? null });
  } catch {
    return NextResponse.json({ market, price24h: null });
  }
}
