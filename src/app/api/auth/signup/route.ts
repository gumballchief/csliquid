export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
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
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  try {
    await ensureTable();

    const existing = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }

    const hash = hashPassword(password);
    await sql`INSERT INTO auth_users (email, password_hash) VALUES (${email}, ${hash})`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // If POSTGRES_URL is not configured, tell the client gracefully.
    if (msg.includes('POSTGRES_URL') || msg.includes('connect') || msg.includes('database')) {
      return NextResponse.json({ error: 'Email auth is not configured on this deployment. Use wallet or guest instead.' }, { status: 503 });
    }
    console.error('[auth/signup]', msg);
    return NextResponse.json({ error: 'Server error — try again.' }, { status: 500 });
  }
}
