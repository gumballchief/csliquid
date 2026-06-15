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
    return NextResponse.json({ ok: true });
  }

  let body: { referrerWallet?: string; tradeVolume?: number; fee?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { referrerWallet, tradeVolume = 0, fee = 0 } = body;
  if (!referrerWallet) return NextResponse.json({ ok: true });

  const referralFee = fee * 0.1;
  const refKey      = `referrer:${referrerWallet}`;

  try {
    const data = await kv.get<ReferrerData>(refKey);
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
    }
  } catch {}

  return NextResponse.json({ ok: true });
}
