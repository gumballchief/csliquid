export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import type { ReferrerData } from '../register/route';

function kvUnavailable(): boolean {
  return !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;
}

// Called after a referred trade executes successfully.
// Body: { referrerWallet: string, tradeVolume: number, fee: number }
// Referrer earns 10% of the trading fee.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (kvUnavailable()) {
    console.warn('[referral/track] KV not configured — skipping');
    return NextResponse.json({ ok: true });
  }

  let body: { referrerWallet?: string; tradeVolume?: number; fee?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { referrerWallet, tradeVolume = 0, fee = 0 } = body;
  console.log('[referral/track] referrerWallet:', referrerWallet, 'tradeVolume:', tradeVolume, 'fee:', fee);
  if (!referrerWallet) return NextResponse.json({ ok: true });

  const referralFee = fee * 0.1;
  const refKey      = `referrer:${referrerWallet}`;

  try {
    const data = await kv.get<ReferrerData>(refKey);
    console.log('[referral/track] existing data:', data ? `username=${data.username} fees=${data.fees}` : 'not found');

    if (data) {
      const updated: ReferrerData = {
        ...data,
        volume:    data.volume    + tradeVolume,
        fees:      data.fees      + referralFee,
        claimable: data.claimable + referralFee,
      };
      await Promise.all([
        kv.set(refKey, updated),
        kv.zincrby('leaderboard:referral', referralFee, referrerWallet),
      ]);
      console.log('[referral/track] credited referralFee:', referralFee, 'total fees now:', updated.fees);
    } else {
      console.warn('[referral/track] referrer wallet not registered:', referrerWallet);
    }
  } catch (err) {
    console.error('[referral/track] KV error:', err);
    return NextResponse.json({ error: 'KV error', ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
