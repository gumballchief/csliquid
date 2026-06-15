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
    return NextResponse.json({ ok: true });
  }

  let body: { wallet?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wallet } = body;
  if (!wallet) return NextResponse.json({ ok: true });

  try {
    const refKey = `referrer:${wallet}`;
    const data   = await kv.get<ReferrerData>(refKey);
    if (data) {
      await kv.set(refKey, { ...data, referrals: data.referrals + 1 });
    }
  } catch {}

  return NextResponse.json({ ok: true });
}
