export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import { clusterApiUrl, Connection } from '@solana/web3.js';
import rawIdl from '@/lib/idl/cs_skin_futures.json';
import { COMMITMENT, NETWORK } from '@/lib/config';
import { findLiquidityPoolPda } from '@/lib/program';

const LAMPORTS = 1_000_000;
const YEAR_S   = 365 * 24 * 3600;

const connection = new Connection(clusterApiUrl(NETWORK), COMMITMENT);

const dummyWallet = {
  publicKey:           null as never,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction:     async (tx: any) => tx,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAllTransactions: async (txs: any[]) => txs,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: COMMITMENT });
const program  = new Program(rawIdl as unknown as Idl, provider);

const RPC_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms),
    ),
  ]);
}

export async function GET(): Promise<NextResponse> {
  try {
    const poolPda = findLiquidityPoolPda();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await withTimeout(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (program.account as any).liquidityPool.fetchNullable(poolPda) as Promise<Record<string, unknown> | null>,
      RPC_TIMEOUT_MS,
      'solana_rpc',
    ) as Record<string, unknown> | null;

    if (!raw) {
      return NextResponse.json({ initialized: false });
    }

    const totalUsdc     = Number((raw.totalUsdc     as BN).toString()) / LAMPORTS;
    const lpSupply      = Number((raw.lpSupply      as BN).toString());
    const feesEarned    = Number((raw.feesEarned    as BN).toString()) / LAMPORTS;
    const traderPnlPaid = Number((raw.traderPnlPaid as BN).toString()) / LAMPORTS;
    const inceptionTs   = Number((raw.inceptionTs   as BN).toString());

    const sharePrice = lpSupply > 0 ? totalUsdc / (lpSupply / LAMPORTS) : 1;

    const elapsed = Date.now() / 1000 - inceptionTs;
    const apr7d   = elapsed > 0 && sharePrice > 1
      ? ((sharePrice - 1) / (elapsed / YEAR_S)) * 100
      : 0;

    return NextResponse.json({
      initialized: true,
      totalUsdc,
      lpSupply,
      feesEarned,
      traderPnlPaid,
      inceptionTs,
      sharePrice,
      apr7d,
    });
  } catch (err) {
    console.error('[pool/stats]', err);
    return NextResponse.json({ error: 'Failed to fetch pool stats' }, { status: 500 });
  }
}
