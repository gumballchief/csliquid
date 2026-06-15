export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export interface ReferrerData {
  username:  string;
  wallet:    string;
  referrals: number;
  volume:    number;
  fees:      number;
  claimable: number;
  createdAt: number;
}

function kvUnavailable(): boolean {
  return !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (kvUnavailable()) {
    return NextResponse.json({ error: 'Referral system not configured' }, { status: 503 });
  }

  let body: { wallet?: string; username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wallet, username } = body;

  if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }
  if (!username || !USERNAME_RE.test(username)) {
    return NextResponse.json({
      error: 'Username must be 3–20 characters: letters, numbers, underscores only',
    }, { status: 400 });
  }

  const key    = username.toLowerCase();
  const refKey = `referrer:${wallet}`;
  const uKey   = `username:${key}`;

  // Check if this wallet is already registered
  const existing = await kv.get<ReferrerData>(refKey);
  if (existing) {
    return NextResponse.json({ ...existing, registered: true }, { status: 200 });
  }

  // Check if username is taken
  const taken = await kv.get<string>(uKey);
  if (taken) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }

  const data: ReferrerData = {
    username,
    wallet,
    referrals: 0,
    volume:    0,
    fees:      0,
    claimable: 0,
    createdAt: Date.now(),
  };

  await Promise.all([
    kv.set(uKey,   wallet),
    kv.set(refKey, data),
    kv.zadd('leaderboard:referral', { score: 0, member: wallet }),
  ]);

  return NextResponse.json({ ...data, registered: true }, { status: 201 });
}
