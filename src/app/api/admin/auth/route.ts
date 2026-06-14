import { NextRequest, NextResponse } from 'next/server';

const ADMIN_ADDRESS = 'EFm418GYQM4qxeqH5CLbndGGC2NYXtMozZtDPs6veHne';
const COOKIE_NAME   = 'csl_admin';
const COOKIE_BASE   = {
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

// POST { address } → set admin session cookie if address matches
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body?.address !== 'string' || body.address !== ADMIN_ADDRESS) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, ADMIN_ADDRESS, { ...COOKIE_BASE, maxAge: 60 * 60 * 4 });
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

// DELETE → clear admin session cookie
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { ...COOKIE_BASE, maxAge: 0 });
  return res;
}
