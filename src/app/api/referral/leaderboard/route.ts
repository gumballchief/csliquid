export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import type { ReferrerData } from '../register/route';

function kvUnavailable(): boolean {
  return !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;
}

export interface LeaderboardEntry {
  rank:      number;
  username:  string;
  wallet:    string;
  referrals: number;
  volume:    number;
  fees:      number;
}

export async function GET(): Promise<NextResponse> {
  if (kvUnavailable()) {
    return NextResponse.json([]);
  }

  try {
    // Top 50 wallets by fees (score), highest first
    const wallets = await kv.zrange<string[]>('leaderboard:referral', 0, 49, { rev: true });
    if (!wallets.length) return NextResponse.json([]);

    // Batch-fetch referrer data
    const pipeline = kv.pipeline();
    for (const w of wallets) pipeline.get<ReferrerData>(`referrer:${w}`);
    const results = await pipeline.exec<(ReferrerData | null)[]>();

    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < wallets.length; i++) {
      const d = results[i];
      if (!d) continue;
      entries.push({
        rank:      entries.length + 1,
        username:  d.username,
        wallet:    wallets[i],
        referrals: d.referrals,
        volume:    d.volume,
        fees:      d.fees,
      });
    }

    return NextResponse.json(entries);
  } catch {
    return NextResponse.json([]);
  }
}
