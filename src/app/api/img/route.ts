import { NextRequest, NextResponse } from 'next/server';

// Allowlist — only proxy Steam CDN hosts
const ALLOWED_HOSTS = new Set([
  'steamcommunity-a.akamaihd.net',
  'community.akamai.steamstatic.com',
  'community.cloudflare.steamstatic.com',
]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new NextResponse('Missing url', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse('Forbidden host', { status: 403 });
  }

  try {
    const upstream = await fetch(raw, {
      headers: {
        // Impersonate a browser visiting Steam itself so hotlink check passes
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://steamcommunity.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream ${upstream.status}`, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/png';
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new NextResponse('Failed to fetch image', { status: 502 });
  }
}
