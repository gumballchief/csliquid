export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { scryptSync, timingSafeEqual } from 'crypto';

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    const hashBuf = Buffer.from(hash, 'hex');
    const testBuf = scryptSync(password, salt, 64);
    return timingSafeEqual(hashBuf, testBuf);
  } catch {
    return false;
  }
}

async function ensureTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS auth_users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: string; password?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  try {
    await ensureTable();

    const result = await sql`SELECT password_hash FROM auth_users WHERE email = ${email}`;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'No account found with that email.' }, { status: 401 });
    }

    const valid = verifyPassword(password, result.rows[0].password_hash as string);
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('POSTGRES_URL') || msg.includes('connect') || msg.includes('database')) {
      return NextResponse.json({ error: 'Email auth is not configured on this deployment. Use wallet or guest instead.' }, { status: 503 });
    }
    console.error('[auth/login]', msg);
    return NextResponse.json({ error: 'Server error — try again.' }, { status: 500 });
  }
}
