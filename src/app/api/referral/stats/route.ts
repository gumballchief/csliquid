export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import type { ReferrerData } from '../register/route';

function kvUnavailable(): boolean {
  return !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (kvUnavailable()) {
    console.warn('[referral/stats] KV not configured');
    return NextResponse.json({ registered: false });
  }

  const wallet = req.nextUrl.searchParams.get('wallet');
  console.log('[referral/stats] wallet:', wallet);
  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  }

  try {
    const data = await kv.get<ReferrerData>(`referrer:${wallet}`);
    console.log('[referral/stats] data:', data ? `username=${data.username} referrals=${data.referrals} fees=${data.fees}` : 'not found');
    if (!data) {
      return NextResponse.json({ registered: false });
    }
    return NextResponse.json({ ...data, registered: true });
  } catch (err) {
    console.error('[referral/stats] KV error:', err);
    return NextResponse.json({ registered: false });
  }
}
