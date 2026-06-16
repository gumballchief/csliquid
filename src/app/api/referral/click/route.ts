export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import type { ReferrerData } from '../register/route';

function kvUnavailable(): boolean {
  return !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;
}

// Called when someone visits /ref/[username] — increments the referrals counter.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (kvUnavailable()) {
    console.warn('[referral/click] KV not configured — skipping');
    return NextResponse.json({ ok: true });
  }

  let body: { wallet?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wallet } = body;
  console.log('[referral/click] wallet:', wallet);
  if (!wallet) return NextResponse.json({ ok: true });

  try {
    const refKey = `referrer:${wallet}`;
    const data   = await kv.get<ReferrerData>(refKey);
    console.log('[referral/click] existing data:', data ? `referrals=${data.referrals}` : 'not found');

    if (data) {
      const updated = { ...data, referrals: data.referrals + 1 };
      await kv.set(refKey, updated);
      console.log('[referral/click] updated referrals to:', updated.referrals);
    } else {
      console.warn('[referral/click] wallet not registered in KV — no increment');
    }
  } catch (err) {
    console.error('[referral/click] KV error:', err);
    return NextResponse.json({ error: 'KV error', ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
