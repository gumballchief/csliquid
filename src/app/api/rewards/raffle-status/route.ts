/**
 * GET /api/rewards/raffle-status
 *
 * Returns current weekly $CSLIQ raffle state.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// Weekly prizes — change each week
const WEEKLY_PRIZE = {
  name:  'AWP | Dragon Lore (Minimal Wear)',
  value: 6500,
  imageUrl: '',
};

function nextSundayMidnightUTC(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilSunday);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

export async function GET() {
  const endsAt = nextSundayMidnightUTC();

  let lastWinner: { wallet: string; prize: string } | null = null;
  try {
    const stored = await kv.get<{ wallet: string; prize: string }>('raffle_last_winner');
    lastWinner = stored ?? null;
  } catch { /* KV unavailable */ }

  return NextResponse.json({
    prize:       WEEKLY_PRIZE.name,
    prizeValue:  WEEKLY_PRIZE.value,
    prizeImage:  WEEKLY_PRIZE.imageUrl,
    endsAt:      endsAt.toISOString(),
    ticketsPerN: 100_000,    // 1 ticket per 100k $CSLIQ held
    lastWinner,
  });
}
