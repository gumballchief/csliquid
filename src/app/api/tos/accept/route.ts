export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { recordAcceptance } from '@/lib/tosDb';

interface AcceptBody {
  wallet?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as AcceptBody;
    const wallet     = typeof body?.wallet === 'string' && body.wallet.trim()
      ? body.wallet.trim()
      : 'anonymous';
    const ipCountry  = req.headers.get('CF-IPCountry') ?? undefined;
    const userAgent  = req.headers.get('user-agent') ?? undefined;

    recordAcceptance({ wallet, ipCountry, userAgent });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[tos/accept] error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
