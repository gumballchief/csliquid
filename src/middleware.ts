import { NextRequest, NextResponse } from 'next/server';

// Two-letter ISO 3166-1 alpha-2 codes of restricted jurisdictions.
const BLOCKED_COUNTRIES = new Set(['NL', 'BE']);

const ADMIN_ADDRESS = 'EFm418GYQM4qxeqH5CLbndGGC2NYXtMozZtDPs6veHne';
const ADMIN_COOKIE  = 'csl_admin';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin guard — silently redirect to "/" with no indication this route exists.
  if (pathname.startsWith('/admin')) {
    const cookie = req.cookies.get(ADMIN_COOKIE);
    if (cookie?.value !== ADMIN_ADDRESS) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // CF-IPCountry is set by Cloudflare; absent in local development → allow.
  const country = req.headers.get('CF-IPCountry') ?? '';
  if (BLOCKED_COUNTRIES.has(country.toUpperCase())) {
    return NextResponse.redirect(new URL('/blocked', req.url), { status: 302 });
  }

  return NextResponse.next();
}

export const config = {
  // Skip: the blocked page itself (avoid redirect loop), Next.js internals,
  // static assets, and the ToS accept API route.
  matcher: [
    '/((?!blocked|_next/static|_next/image|favicon\\.ico|api/tos).*)',
  ],
};
