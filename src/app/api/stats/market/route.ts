export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import rawIdl from '@/lib/idl/cs_skin_futures.json';
import { COMMITMENT, PROGRAM_ID, RPC_URL } from '@/lib/config';
import { initDb, db } from '@/lib/db';

const LAMPORTS = 1_000_000;

const connection = new Connection(RPC_URL, COMMITMENT);
const dummyWallet = {
  publicKey: null as never,
  signTransaction: async (tx: unknown) => tx,
  signAllTransactions: async (txs: unknown[]) => txs,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: COMMITMENT });
const program  = new Program(rawIdl as unknown as Idl, provider);

const INDEX_IDS = ['AWP', 'AK47', 'KNIFE', 'GLOVE', 'CS500'] as const;

function findPriceFeedPda(indexId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('price_feed'), Buffer.from(indexId)],
    PROGRAM_ID,
  );
  return pda;
}
function findMarketPda(priceFeed: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('market'), priceFeed.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

const SKIN_TO_INDEX: Record<string, string> = {
  'awp-index': 'AWP', 'ak47-index': 'AK47', 'knife-index': 'KNIFE',
  'glove-index': 'GLOVE', 'cs500-index': 'CS500',
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const market = req.nextUrl.searchParams.get('market') ?? 'awp-index';
  const indexId = SKIN_TO_INDEX[market] ?? 'AWP';

  try {
    // ── Open interest + funding rate from chain ────────────────────────────────
    let longOI  = 0;
    let shortOI = 0;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const positions: Array<{ account: any }> = await (program.account as any).position.all();
      const feedPda   = findPriceFeedPda(indexId);
      const marketPda = findMarketPda(feedPda);
      const marketKey = marketPda.toString();

      for (const { account: pos } of positions) {
        if ((pos.market as PublicKey).toString() !== marketKey) continue;
        const notional = Number((pos.notional as BN).toString()) / LAMPORTS;
        if (pos.isLong) longOI += notional;
        else            shortOI += notional;
      }
    } catch { /* chain unavailable */ }

    const totalOI    = longOI + shortOI;
    const imbalance  = totalOI > 0 ? (longOI - shortOI) / totalOI : 0;
    const fundingRate = imbalance * 0.0001; // 0.01%/hr at full imbalance

    // ── 24h volume from DB ─────────────────────────────────────────────────────
    let volume24h = 0;
    if (process.env.POSTGRES_URL) {
      try {
        await initDb();
        const since = new Date(Date.now() - 86_400_000).toISOString();
        // Use the db module's sql directly via a narrow query
        const { sql } = await import('@vercel/postgres');
        const result = await sql`
          SELECT COALESCE(SUM(notional), 0) AS vol
          FROM positions
          WHERE market = ${indexId}
            AND opened_at >= ${since}
        `;
        volume24h = Number(result.rows[0]?.vol ?? 0);
      } catch { /* DB unavailable */ }
    }

    return NextResponse.json({
      market,
      volume24h,
      fundingRate,
      openInterest: totalOI,
      longOI,
      shortOI,
    });
  } catch (err) {
    console.error('[stats/market]', err);
    return NextResponse.json({ market, volume24h: 0, fundingRate: 0, openInterest: 0, longOI: 0, shortOI: 0 });
  }
}
