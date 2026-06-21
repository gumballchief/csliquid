/**
 * GET /api/rewards/roll-status?wallet=<address>
 *
 * Returns whether the wallet has already rolled today + their current streak.
 * Called on page load by the rewards page to pre-set button state.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet') ?? '';
  if (!wallet || wallet.length < 32) {
    return NextResponse.json({ alreadyRolled: false, streak: 0 });
  }

  const today = todayKey();
  let alreadyRolled = false;
  let streak = 0;

  try {
    const [rolled, streakData] = await Promise.all([
      kv.get<boolean>(`roll_used:${wallet}:${today}`),
      kv.get<{ count: number; lastDate: string }>(`roll_streak:${wallet}`),
    ]);
    alreadyRolled = !!rolled;
    streak = streakData?.count ?? 0;
  } catch {
    // KV unavailable — return defaults (button will be enabled, which is fine)
  }

  return NextResponse.json({ alreadyRolled, streak });
}
