export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

function kvUnavailable(): boolean {
  return !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (kvUnavailable()) {
    return NextResponse.json({ wallet: null });
  }

  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ wallet: null });
  }

  try {
    const wallet = await kv.get<string>(`username:${username.toLowerCase()}`);
    return NextResponse.json({ wallet: wallet ?? null });
  } catch {
    return NextResponse.json({ wallet: null });
  }
}
