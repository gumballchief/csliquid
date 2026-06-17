export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import rawIdl from '@/lib/idl/cs_skin_futures.json';
import { COMMITMENT, RPC_URL } from '@/lib/config';

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

export async function GET(): Promise<NextResponse> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions: Array<{ account: any }> = await (program.account as any).position.all();

    let activePositions = 0;
    const uniqueOwners = new Set<string>();

    for (const { account: pos } of positions) {
      const size = Number((pos.size as BN).toString()) / LAMPORTS;
      if (size > 0) {
        activePositions++;
        uniqueOwners.add(pos.owner.toString());
      }
    }

    return NextResponse.json({
      activePositions,
      uniqueTraders: uniqueOwners.size,
    });
  } catch (err) {
    console.error('[stats/overview]', err);
    return NextResponse.json({ activePositions: 0, uniqueTraders: 0 });
  }
}
