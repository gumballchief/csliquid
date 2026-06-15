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

// UI route params use 'awp-index' format; on-chain uses 'AWP'. Normalize either form.
const SKIN_TO_INDEX: Record<string, IndexId> = {
  'awp-index':   'AWP',
  'ak47-index':  'AK47',
  'knife-index': 'KNIFE',
  'glove-index': 'GLOVE',
  'cs500-index': 'CS500',
};

function normalizeIndexId(id: string): string {
  return SKIN_TO_INDEX[id] ?? id;
}

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
 * Accepts both 'AWP' and 'awp-index' formats.
 */
export function getPriceFeed(indexId: string): PublicKey {
  const normalized = normalizeIndexId(indexId);
  if (!INDEX_IDS.includes(normalized as IndexId)) {
    throw new Error(`Unknown index ID: ${indexId} — must be one of ${INDEX_IDS.join(', ')}`);
  }
  return findPriceFeedPda(normalized);
}

export function isMarketConfigured(indexId: string): boolean {
  return INDEX_IDS.includes(normalizeIndexId(indexId) as IndexId);
}
