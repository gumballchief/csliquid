export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import rawIdl from '@/lib/idl/cs_skin_futures.json';
import { COMMITMENT, PROGRAM_ID, RPC_URL } from '@/lib/config';
import { initDb, db } from '@/lib/db';
import { kv } from '@vercel/kv';

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

interface TraderStats {
  wallet: string;
  totalPnl: number;
  unrealizedPnl: number;
  trades: number;
  volume: number;
  wins: number;
  winRate: number;
  username?: string | null;
}

async function resolveUsernames(wallets: string[]): Promise<Record<string, string>> {
  if (!wallets.length || !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return {};
  try {
    const pipeline = kv.pipeline();
    for (const w of wallets) pipeline.get<{ username?: string }>(`referrer:${w}`);
    const results = await pipeline.exec<({ username?: string } | null)[]>();
    const map: Record<string, string> = {};
    for (let i = 0; i < wallets.length; i++) {
      const d = results[i];
      if (d?.username) map[wallets[i]] = d.username;
    }
    return map;
  } catch {
    return {};
  }
}

// ── DB leaderboard (closed trades, realized PnL) ──────────────────────────────

async function getDbLeaderboard(): Promise<TraderStats[]> {
  await initDb();
  const rows = await db.getLeaderboard(50);
  return rows.map(r => ({
    wallet:       r.wallet,
    totalPnl:     r.total_pnl,
    unrealizedPnl: 0,
    trades:       r.trades,
    volume:       r.volume,
    wins:         r.wins,
    winRate:      r.win_rate,
  }));
}

// ── On-chain leaderboard (open positions, unrealized PnL) ─────────────────────

async function getOnChainLeaderboard(): Promise<TraderStats[]> {
  const priceByMarket = new Map<string, number>();
  for (const indexId of INDEX_IDS) {
    try {
      const feedPda   = findPriceFeedPda(indexId);
      const marketPda = findMarketPda(feedPda);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const feed = await (program.account as any).priceFeed.fetchNullable(feedPda);
      if (feed) {
        priceByMarket.set(marketPda.toString(), Number((feed.price as BN).toString()) / LAMPORTS);
      }
    } catch {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let positions: Array<{ publicKey: PublicKey; account: any }> = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    positions = await (program.account as any).position.all();
  } catch {
    return [];
  }

  if (positions.length === 0) return [];

  const byOwner = new Map<string, { trades: number; volume: number; unrealizedPnl: number; wins: number }>();

  for (const { account: pos } of positions) {
    const owner      = (pos.owner as PublicKey).toString();
    const isLong     = pos.isLong as boolean;
    const notional   = Number((pos.notional as BN).toString()) / LAMPORTS;
    const entryPrice = Number((pos.entryPrice as BN).toString()) / LAMPORTS;
    const marketKey  = (pos.market as PublicKey).toString();
    const price      = priceByMarket.get(marketKey) ?? entryPrice;

    const unrealizedPnl = isLong
      ? (price - entryPrice) / entryPrice * notional
      : (entryPrice - price) / entryPrice * notional;

    const existing = byOwner.get(owner) ?? { trades: 0, volume: 0, unrealizedPnl: 0, wins: 0 };
    byOwner.set(owner, {
      trades:       existing.trades + 1,
      volume:       existing.volume + notional,
      unrealizedPnl: existing.unrealizedPnl + unrealizedPnl,
      wins:         existing.wins + (unrealizedPnl > 0 ? 1 : 0),
    });
  }

  return Array.from(byOwner.entries())
    .map(([wallet, s]) => ({
      wallet,
      totalPnl:     s.unrealizedPnl,
      unrealizedPnl: s.unrealizedPnl,
      trades:       s.trades,
      volume:       s.volume,
      wins:         s.wins,
      winRate:      s.trades > 0 ? (s.wins / s.trades) * 100 : 0,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl)
    .slice(0, 50);
}

export async function GET(): Promise<NextResponse> {
  try {
    const results = process.env.POSTGRES_URL
      ? await getDbLeaderboard()
      : await getOnChainLeaderboard();

    const usernameMap = await resolveUsernames(results.map(r => r.wallet));
    const withUsernames = results.map(r => ({
      ...r,
      username: usernameMap[r.wallet] ?? null,
    }));

    return NextResponse.json(withUsernames);
  } catch (err) {
    console.error('[leaderboard]', err);
    return NextResponse.json([]);
  }
}
