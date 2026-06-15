export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import rawIdl from '@/lib/idl/cs_skin_futures.json';
import { COMMITMENT, PROGRAM_ID, RPC_URL } from '@/lib/config';

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

export async function GET(): Promise<NextResponse> {
  const results: Record<string, unknown> = {};

  for (const indexId of INDEX_IDS) {
    try {
      const feedPda   = findPriceFeedPda(indexId);
      const marketPda = findMarketPda(feedPda);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [feed, market] = await Promise.allSettled([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (program.account as any).priceFeed.fetchNullable(feedPda),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (program.account as any).market.fetchNullable(marketPda),
      ]);

      const feedData   = feed.status === 'fulfilled' ? feed.value : null;
      const marketData = market.status === 'fulfilled' ? market.value : null;

      const price       = feedData   ? Number((feedData.price as BN).toString()) / LAMPORTS : 0;
      const publishedAt = feedData   ? Number((feedData.publishedAt as BN).toString()) : 0;
      const longOI      = marketData ? Number((marketData.totalLongOpenInterest as BN).toString()) / LAMPORTS : 0;
      const shortOI     = marketData ? Number((marketData.totalShortOpenInterest as BN).toString()) / LAMPORTS : 0;
      const fundingRate = marketData ? Number((marketData.fundingRate as BN).toString()) / 1e8 : 0;

      const nowSec  = Date.now() / 1000;
      const ageSec  = publishedAt > 0 ? nowSec - publishedAt : Infinity;
      const healthy = ageSec < 300; // 5 minutes

      results[indexId] = {
        price,
        publishedAt,
        ageSec:      Math.round(ageSec),
        healthy,
        longOI,
        shortOI,
        fundingRate,
        initialized: feedData !== null,
      };
    } catch {
      results[indexId] = { price: 0, publishedAt: 0, ageSec: Infinity, healthy: false, initialized: false };
    }
  }

  return NextResponse.json(results);
}
