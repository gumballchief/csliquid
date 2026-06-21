export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let address: string;
  try {
    const body = await req.json() as { address?: string };
    address = body.address ?? '';
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!address || address.length < 32) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { sql } = await import('@vercel/postgres');
    await sql`
      CREATE TABLE IF NOT EXISTS wallets (
        address    VARCHAR(64)  PRIMARY KEY,
        first_seen TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        last_seen  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      INSERT INTO wallets (address)
      VALUES (${address})
      ON CONFLICT (address) DO UPDATE SET last_seen = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[wallets/register]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
