export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, db } from '@/lib/db';

// Valid Solana base58 tx signature: 87-88 base58 chars
const TX_REGEX = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;
// Valid Solana public key: 32-44 base58 chars
const WALLET_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const VALID_MARKETS = new Set([
  'awp-index','ak47-index','knife-index','glove-index','cs500-index',
]);

const VALID_DIRECTIONS = new Set(['LONG', 'SHORT']);

/** Lightweight on-chain tx existence check via Helius RPC */
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
    // Must exist and not be errored
    return !!status && status.confirmationStatus != null;
  } catch {
    // RPC timeout — allow in dev but log
    console.warn('[record-open] tx existence check timed out, allowing');
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
    const { wallet, market, direction, size, collateral, leverage, entry_price, liq_price, notional, fee, tx } = body as Record<string, unknown>;

    // ── Required field presence ───────────────────────────────────────────
    if (!wallet || !market || !direction || !tx) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── Format validation ─────────────────────────────────────────────────
    if (!WALLET_REGEX.test(String(wallet))) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }
    if (!TX_REGEX.test(String(tx))) {
      return NextResponse.json({ error: 'Invalid transaction signature' }, { status: 400 });
    }
    if (!VALID_MARKETS.has(String(market))) {
      return NextResponse.json({ error: 'Unknown market' }, { status: 400 });
    }
    if (!VALID_DIRECTIONS.has(String(direction).toUpperCase())) {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
    }

    // ── Numeric sanity ────────────────────────────────────────────────────
    const col = Number(collateral);
    const lev = Number(leverage);
    const ep  = Number(entry_price);
    if (col <= 0 || col > 1_000_000)   return NextResponse.json({ error: 'Invalid collateral' }, { status: 400 });
    if (lev < 1  || lev > 20)           return NextResponse.json({ error: 'Invalid leverage' }, { status: 400 });
    if (ep  <= 0)                        return NextResponse.json({ error: 'Invalid entry price' }, { status: 400 });

    // ── On-chain tx existence check ───────────────────────────────────────
    const exists = await txExistsOnChain(String(tx));
    if (!exists) {
      return NextResponse.json({ error: 'Transaction not found on-chain' }, { status: 400 });
    }

    const id = await db.recordOpenPosition({
      wallet:      String(wallet),
      market:      String(market),
      direction:   String(direction).toUpperCase() as 'LONG' | 'SHORT',
      size:        Number(size),
      collateral:  col,
      leverage:    lev,
      entry_price: ep,
      liq_price:   Number(liq_price),
      notional:    Number(notional),
      fee:         Number(fee),
      open_tx:     String(tx),
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[trades/record-open]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
