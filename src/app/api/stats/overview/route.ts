export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { sql } from '@vercel/postgres';
import { COMMITMENT, PROGRAM_ID, RPC_URL } from '@/lib/config';

const connection = new Connection(RPC_URL, COMMITMENT);

// sha256("global:position")[0:8] = [170, 188, 143, 228, 122, 64, 247, 208]
// base58 of those 8 bytes:
const POSITION_DISCRIMINATOR_B58 = 'VZMoMoKgZQb';

// size field is at byte offset 81 in the account data (8-byte u64 LE)
const SIZE_OFFSET = 81;

export async function GET(): Promise<NextResponse> {
  let activePositions = 0;
  let uniqueTraders = 0;

  // On-chain: count positions where size > 0
  try {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      commitment: COMMITMENT,
      filters: [{ memcmp: { offset: 0, bytes: POSITION_DISCRIMINATOR_B58 } }],
      dataSlice: { offset: SIZE_OFFSET, length: 8 },
    });

    for (const { account } of accounts) {
      const lo = account.data.readUInt32LE(0);
      const hi = account.data.readUInt32LE(4);
      if (lo > 0 || hi > 0) activePositions++;
    }
  } catch (err) {
    console.error('[stats/overview] on-chain error:', err);
  }

  // Postgres: unique wallets across all position records
  try {
    const result = await sql`SELECT COUNT(DISTINCT wallet)::int AS count FROM positions`;
    uniqueTraders = Number(result.rows[0]?.count ?? 0);
  } catch {
    // Postgres not configured — leave as 0
  }

  return NextResponse.json({ activePositions, uniqueTraders });
}
