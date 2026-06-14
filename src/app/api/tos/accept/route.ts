export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body   = await req.json() as { wallet?: string };
    const wallet = typeof body?.wallet === 'string' && body.wallet.trim()
      ? body.wallet.trim()
      : 'anonymous';

    console.log('[tos/accept]', wallet, req.headers.get('CF-IPCountry') ?? 'unknown');

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
