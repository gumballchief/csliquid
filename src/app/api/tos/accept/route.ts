export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

// SQLite is not available on Vercel serverless (no persistent writable FS).
// Acceptance is already tracked client-side in a cookie; server-side storage
// is not required for the ToS gate to work correctly.

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body   = await req.json() as { wallet?: string };
    const wallet = typeof body?.wallet === 'string' && body.wallet.trim()
      ? body.wallet.trim()
      : 'anonymous';

    console.log('[tos/accept] accepted', {
      wallet,
      country:   req.headers.get('CF-IPCountry') ?? 'unknown',
      userAgent: req.headers.get('user-agent')   ?? 'unknown',
      ts:        new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[tos/accept] error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
