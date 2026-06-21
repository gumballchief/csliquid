/**
 * POST /api/rewards/roll
 *
 * Daily Case Roll logic:
 * - User must have traded $100+ collateral today (checks Postgres positions table)
 * - User gets 1 roll per day (tracked in KV)
 * - 2% chance to win; 25% if on a 7-day streak
 * - Streak tracked in KV
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// Prize pool — rotate these over time
const PRIZES = [
  { name: 'AWP | Asiimov (Factory New)',             value: 250  },
  { name: 'AK-47 | Fire Serpent (Field-Tested)',     value: 400  },
  { name: 'Desert Eagle | Blaze (Factory New)',       value: 600  },
  { name: 'Karambit | Fade (Factory New)',            value: 1800 },
  { name: 'AWP | Dragon Lore (Field-Tested)',         value: 4000 },
  { name: 'M4A4 | Howl (Field-Tested)',               value: 2000 },
  { name: 'AWP | Gungnir (Field-Tested)',             value: 1500 },
  { name: 'Glock-18 | Fade (Factory New)',            value: 800  },
  { name: 'USP-S | Kill Confirmed (Factory New)',     value: 500  },
  { name: '$10 USDC',                                 value: 10   },
  { name: '$25 USDC',                                 value: 25   },
  { name: '$50 USDC',                                 value: 50   },
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function yesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function getStreak(wallet: string): Promise<{ count: number; lastDate: string }> {
  try {
    const stored = await kv.get<{ count: number; lastDate: string }>(`roll_streak:${wallet}`);
    return stored ?? { count: 0, lastDate: '' };
  } catch {
    return { count: 0, lastDate: '' };
  }
}

async function updateStreak(wallet: string, today: string, currentStreak: { count: number; lastDate: string }) {
  const wasYesterday = currentStreak.lastDate === yesterdayKey();
  const newCount = wasYesterday ? currentStreak.count + 1 : 1;
  try {
    await kv.set(`roll_streak:${wallet}`, { count: newCount, lastDate: today }, { ex: 8 * 24 * 3600 });
  } catch { /* silently ignore KV failures */ }
  return newCount;
}

export async function POST(req: NextRequest) {
  let wallet: string;
  try {
    const body = await req.json() as { wallet?: string };
    wallet = body.wallet ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!wallet || wallet.length < 32) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  }

  const today = todayKey();

  // Check if user has already rolled today
  try {
    const alreadyRolled = await kv.get<boolean>(`roll_used:${wallet}:${today}`);
    if (alreadyRolled) {
      return NextResponse.json({ error: 'Already rolled today', alreadyRolled: true }, { status: 429 });
    }
  } catch { /* KV unavailable — allow roll */ }

  // Check trade eligibility: did user trade $100+ collateral today?
  let eligible = false;
  if (!process.env.POSTGRES_URL) {
    // No DB — grant eligibility for demo purposes
    eligible = true;
  } else {
    try {
      const { sql } = await import('@vercel/postgres');
      const result = await sql`
        SELECT COUNT(*) AS cnt
        FROM positions
        WHERE wallet = ${wallet}
          AND collateral >= 100
          AND opened_at >= CURRENT_DATE AT TIME ZONE 'UTC'
      `;
      eligible = Number(result.rows[0]?.cnt ?? 0) > 0;
    } catch {
      eligible = true; // DB error — grant eligibility so roll isn't blocked
    }
  }

  if (!eligible) {
    return NextResponse.json({
      error: 'Not eligible',
      eligible: false,
      reason: 'Trade $100+ collateral today to unlock your daily case roll.',
    }, { status: 403 });
  }

  // Get streak and determine win probability
  const streak = await getStreak(wallet);
  const streakCount = streak.count;
  const onStreakBonus = streakCount >= 6 && streak.lastDate === yesterdayKey();
  const winChance = onStreakBonus ? 0.25 : 0.02;

  // Mark roll as used
  try {
    await kv.set(`roll_used:${wallet}:${today}`, true, { ex: 26 * 3600 });
  } catch { /* silently ignore */ }

  // Update streak
  const newStreak = await updateStreak(wallet, today, streak);

  // Roll the dice
  const roll = Math.random();
  if (roll < winChance) {
    // WIN — pick a prize weighted by rarity
    const prizeRoll = Math.random();
    let prize: typeof PRIZES[number];
    if (prizeRoll < 0.005) {
      prize = PRIZES.find(p => p.name.includes('Dragon Lore'))!;
    } else if (prizeRoll < 0.02) {
      prize = PRIZES.find(p => p.name.includes('Howl') || p.name.includes('Karambit'))!;
    } else if (prizeRoll < 0.1) {
      prize = PRIZES.find(p => p.value >= 400 && p.value <= 1800 && !p.name.includes('USDC'))!;
    } else if (prizeRoll < 0.4) {
      prize = PRIZES.find(p => p.value >= 100 && p.value <= 600)!;
    } else {
      prize = PRIZES.find(p => p.name.includes('USDC'))!;
    }

    // Persist win to KV (and optionally Postgres when available)
    const winRecord = { wallet, prize: prize.name, value: prize.value, date: today };
    try {
      await kv.lpush('recent_wins', JSON.stringify(winRecord));
      await kv.ltrim('recent_wins', 0, 49);
    } catch { /* silently ignore */ }

    if (process.env.POSTGRES_URL) {
      try {
        const { sql } = await import('@vercel/postgres');
        await sql`
          CREATE TABLE IF NOT EXISTS rewards_wins (
            id         SERIAL PRIMARY KEY,
            wallet     VARCHAR(64)  NOT NULL,
            prize_name TEXT         NOT NULL,
            prize_value DECIMAL(12,2) NOT NULL,
            won_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          INSERT INTO rewards_wins (wallet, prize_name, prize_value)
          VALUES (${wallet}, ${prize.name}, ${prize.value})
        `;
      } catch { /* silently ignore */ }
    }

    return NextResponse.json({
      won: true,
      prize: prize.name,
      value: prize.value,
      streak: newStreak,
      streakBonus: onStreakBonus,
    });
  }

  return NextResponse.json({
    won: false,
    streak: newStreak,
    streakBonus: onStreakBonus,
    nextStreakMilestone: 7,
  });
}
