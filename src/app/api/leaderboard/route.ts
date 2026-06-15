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

function truncateWallet(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

interface PositionData {
  owner: string;
  isLong: boolean;
  collateral: number;
  size: number;
  notional: number;
  entryPrice: number;
  liquidationPrice: number;
  market: string;
}

interface TraderStats {
  wallet: string;
  totalPnl: number;
  unrealizedPnl: number;
  trades: number;
  volume: number;
  wins: number;
  winRate: number;
}

export async function GET(): Promise<NextResponse> {
  try {
    // Fetch current prices for all markets
    const priceByMarket = new Map<string, number>();
    for (const indexId of INDEX_IDS) {
      try {
        const feedPda = findPriceFeedPda(indexId);
        const marketPda = findMarketPda(feedPda);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const feed = await (program.account as any).priceFeed.fetchNullable(feedPda);
        if (feed) {
          priceByMarket.set(marketPda.toString(), Number((feed.price as BN).toString()) / LAMPORTS);
        }
      } catch {}
    }

    // Fetch all open Position accounts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let positions: Array<{ publicKey: PublicKey; account: any }> = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      positions = await (program.account as any).position.all();
    } catch {
      return NextResponse.json([]);
    }

    if (positions.length === 0) {
      return NextResponse.json([]);
    }

    // Aggregate by owner
    const byOwner = new Map<string, {
      trades: number;
      volume: number;
      unrealizedPnl: number;
      wins: number;
    }>();

    for (const { account: pos } of positions) {
      const owner    = (pos.owner as PublicKey).toString();
      const isLong   = pos.isLong as boolean;
      const notional = Number((pos.notional as BN).toString()) / LAMPORTS;
      const entryPrice   = Number((pos.entryPrice as BN).toString()) / LAMPORTS;
      const marketKey    = (pos.market as PublicKey).toString();
      const currentPrice = priceByMarket.get(marketKey) ?? entryPrice;

      const unrealizedPnl = isLong
        ? (currentPrice - entryPrice) / entryPrice * notional
        : (entryPrice - currentPrice) / entryPrice * notional;

      const existing = byOwner.get(owner) ?? { trades: 0, volume: 0, unrealizedPnl: 0, wins: 0 };
      byOwner.set(owner, {
        trades:       existing.trades + 1,
        volume:       existing.volume + notional,
        unrealizedPnl: existing.unrealizedPnl + unrealizedPnl,
        wins:         existing.wins + (unrealizedPnl > 0 ? 1 : 0),
      });
    }

    const results: TraderStats[] = Array.from(byOwner.entries()).map(([wallet, stats]) => ({
      wallet,
      totalPnl:     stats.unrealizedPnl,
      unrealizedPnl: stats.unrealizedPnl,
      trades:       stats.trades,
      volume:       stats.volume,
      wins:         stats.wins,
      winRate:      stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0,
    }));

    // Sort by total PnL descending
    results.sort((a, b) => b.totalPnl - a.totalPnl);

    return NextResponse.json(results.slice(0, 50));
  } catch (err) {
    console.error('[leaderboard]', err);
    return NextResponse.json([]);
  }
}
