export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let body: { wallet?: string; prize?: string; claimType?: string; steamUsername?: string; receiveWallet?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { wallet, prize, claimType, steamUsername, receiveWallet } = body;

  if (!wallet || wallet.length < 32) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
  }
  if (!prize) {
    return NextResponse.json({ error: 'Missing prize' }, { status: 400 });
  }
  if (claimType !== 'skin' && claimType !== 'usdc') {
    return NextResponse.json({ error: 'claimType must be skin or usdc' }, { status: 400 });
  }
  if (claimType === 'skin' && !steamUsername?.trim()) {
    return NextResponse.json({ error: 'Steam username required for skin claim' }, { status: 400 });
  }
  if (claimType === 'usdc' && !receiveWallet?.trim()) {
    return NextResponse.json({ error: 'Receive wallet required for USDC claim' }, { status: 400 });
  }

  if (!process.env.POSTGRES_URL) {
    // Demo mode: accept claim without persistence
    return NextResponse.json({ ok: true, message: 'Claim recorded (demo mode)' });
  }

  try {
    const { sql } = await import('@vercel/postgres');

    // Ensure columns exist (idempotent migration)
    await sql`
      ALTER TABLE rewards_wins
        ADD COLUMN IF NOT EXISTS claim_type      VARCHAR(10),
        ADD COLUMN IF NOT EXISTS steam_username  TEXT,
        ADD COLUMN IF NOT EXISTS receive_wallet  VARCHAR(64),
        ADD COLUMN IF NOT EXISTS claimed_at      TIMESTAMPTZ
    `;

    // Check for existing unclaimed win for this wallet+prize
    const existing = await sql`
      SELECT id, claimed_at
      FROM rewards_wins
      WHERE wallet = ${wallet}
        AND prize_name = ${prize}
      ORDER BY won_at DESC
      LIMIT 1
    `;

    if (!existing.rows.length) {
      return NextResponse.json({ error: 'No matching win record found' }, { status: 404 });
    }

    const row = existing.rows[0];
    if (row.claimed_at) {
      return NextResponse.json({ error: 'Prize already claimed' }, { status: 409 });
    }

    await sql`
      UPDATE rewards_wins
      SET claim_type     = ${claimType},
          steam_username = ${steamUsername ?? null},
          receive_wallet = ${receiveWallet ?? null},
          claimed_at     = NOW()
      WHERE id = ${row.id}
    `;

    return NextResponse.json({ ok: true, message: 'Claim submitted — team will reach out within 48h.' });
  } catch (err) {
    console.error('[rewards/claim]', err);
    return NextResponse.json({ error: 'Failed to record claim' }, { status: 500 });
  }
}
