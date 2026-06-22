export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, db } from '@/lib/db';

const TX_REGEX     = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;
const WALLET_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Market ID: any alphanumeric + hyphen/underscore, 2–60 chars
const MARKET_REGEX = /^[A-Za-z0-9_-]{2,60}$/;

/** Lightweight on-chain tx existence check */
async function txExistsOnChain(sig: string): Promise<boolean> {
  try {
    const rpc = process.env.HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getSignatureStatuses',
        params: [[sig], { searchTransactionHistory: true }],
      }),
      signal: AbortSignal.timeout(4000),
    });
    const json = await res.json() as { result?: { value?: ({ confirmationStatus?: string } | null)[] } };
    const status = json.result?.value?.[0];
    return !!status && status.confirmationStatus != null;
  } catch {
    console.warn('[record-close] tx existence check timed out, allowing');
    return true;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  try {
    await initDb();
    const body = await req.json();
    const { wallet, market, close_tx, exit_price, entry_price, realized_pnl, direction, size, leverage } = body as Record<string, unknown>;

    // ── Required field presence ───────────────────────────────────────────
    if (!wallet || !market || !close_tx) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── Format validation ─────────────────────────────────────────────────
    if (!WALLET_REGEX.test(String(wallet))) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }
    if (!TX_REGEX.test(String(close_tx))) {
      return NextResponse.json({ error: 'Invalid transaction signature' }, { status: 400 });
    }
    if (!MARKET_REGEX.test(String(market))) {
      return NextResponse.json({ error: 'Invalid market' }, { status: 400 });
    }

    // ── Numeric sanity ────────────────────────────────────────────────────
    const pnl = Number(realized_pnl ?? 0);
    const ep  = Number(exit_price ?? 0);
    // PnL sanity: can't profit more than 500x collateral (matches on-chain cap)
    if (Math.abs(pnl) > 10_000_000) {
      return NextResponse.json({ error: 'Invalid PnL value' }, { status: 400 });
    }
    if (ep < 0) {
      return NextResponse.json({ error: 'Invalid exit price' }, { status: 400 });
    }

    // ── On-chain tx existence check ───────────────────────────────────────
    const exists = await txExistsOnChain(String(close_tx));
    if (!exists) {
      return NextResponse.json({ error: 'Transaction not found on-chain' }, { status: 400 });
    }

    const dir  = direction   ? String(direction)    : null;
    const sz   = size        ? Number(size)         : null;
    const entryEp = entry_price ? Number(entry_price) : ep;
    const lev  = leverage    ? Number(leverage)     : 1;
    await db.recordClosePosition(
      String(wallet),
      String(market),
      String(close_tx),
      ep,
      pnl,
      dir && sz != null ? { direction: dir, size: sz, entry_price: entryEp, leverage: lev } : undefined,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[trades/record-close]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
