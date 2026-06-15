import { PublicKey } from '@solana/web3.js';

import { PROGRAM_ID } from './config';

/**
 * All index IDs that have on-chain markets + PriceFeed accounts.
 * Order must match the oracle service's INDEX_IDS array.
 */
export const INDEX_IDS = [
  'AWP',
  'AK47',
  'KNIFE',
  'GLOVE',
  'CS500',
] as const;

export type IndexId = (typeof INDEX_IDS)[number];

/**
 * Derive the on-chain PriceFeed PDA for an index.
 * Seeds: [b"price_feed", indexId]  — deterministic, no pre-population needed.
 */
export function findPriceFeedPda(indexId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('price_feed'), Buffer.from(indexId)],
    PROGRAM_ID,
  );
  return pda;
}

/**
 * Returns the PriceFeed PDA pubkey for a known index, or throws if the ID
 * is not recognised.  This pubkey is used as both the Market PDA seed and
 * the `price_feed` account in trading instructions.
 */
export function getPriceFeed(indexId: string): PublicKey {
  if (!INDEX_IDS.includes(indexId as IndexId)) {
    throw new Error(`Unknown index ID: ${indexId} — must be one of ${INDEX_IDS.join(', ')}`);
  }
  return findPriceFeedPda(indexId);
}

export function isMarketConfigured(indexId: string): boolean {
  return INDEX_IDS.includes(indexId as IndexId);
}
