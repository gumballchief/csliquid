import { NextRequest, NextResponse } from 'next/server';

// Return a transparent SVG placeholder instead of an error so the browser renders something
function placeholderSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"><rect width="360" height="360" fill="#111214"/></svg>`;
  return new NextResponse(svg, {
    headers: {
      'Content-Type':               'image/svg+xml',
      'Cache-Control':              'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// Allowlist — only proxy Steam CDN hosts
const ALLOWED_HOSTS = new Set([
  'steamcommunity-a.akamaihd.net',
  'community.akamai.steamstatic.com',
  'community.cloudflare.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
    'community.steamstatic.com',
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

  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5_000);

  try {
    const upstream = await fetch(raw, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer':    'https://steamcommunity.com/',
        'Accept':     'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      console.error(`[img] Upstream ${upstream.status} for ${parsed.hostname}${parsed.pathname}`);
      return placeholderSvg();
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/png';
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type':               contentType,
        'Cache-Control':              'public, max-age=604800, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).name === 'AbortError' ? 'timeout_5s' : (err as Error).message;
    console.error(`[img] Fetch failed for ${parsed.hostname}${parsed.pathname}:`, msg);
    return placeholderSvg();
  }
}
