'use client';

/**
 * Polls the on-chain PriceFeed accounts (devnet) every 30 seconds and returns
 * the latest price for every index.
 *
 * Account layout (Anchor, little-endian):
 *   [0..8]   discriminator (8 bytes)
 *   [8..40]  authority: Pubkey (32 bytes)
 *   [40..48] price: u64  — 6-decimal fixed-point, $1.00 = 1_000_000
 *   [48..56] published_at: i64 — unix seconds (set by on-chain clock)
 *   [56]     bump: u8
 */

import { useState, useEffect, useRef } from 'react';
import { Connection } from '@solana/web3.js';
import { INDEX_IDS, findPriceFeedPda } from '@/lib/markets';
import { RPC_URL } from '@/lib/config';

const POLL_MS       = 30_000;
const PRICE_OFFSET  = 40;   // bytes into account data where price u64 starts
const LAMPORTS      = 1_000_000; // 6 decimal fixed-point
const STALE_SECONDS = 300;  // price older than 5 min is considered stale

// Derive PriceFeed PDA addresses from the canonical INDEX_IDS so they always
// match the on-chain accounts (no more hardcoded stale addresses).
const FEED_IDS  = INDEX_IDS as unknown as string[];
const FEED_KEYS = FEED_IDS.map(id => findPriceFeedPda(id));

export interface OnChainPrice {
  /** USD price derived from the 6-decimal u64 on-chain value. */
  price:       number;
  /** Unix seconds of the last push_price call (set by on-chain clock). */
  publishedAt: number;
  /** True if published_at is more than 5 minutes ago. */
  stale:       boolean;
}

export type OnChainPrices = Partial<Record<string, OnChainPrice>>;

// ── Module-level singletons ────────────────────────────────────────────────
// Shared connection and latest snapshot so multiple hook instances don't
// open duplicate connections or lose data across re-renders.

let _conn:   Connection | null = null;
let _latest: OnChainPrices     = {};

function conn(): Connection {
  if (!_conn) _conn = new Connection(RPC_URL, 'confirmed');
  return _conn;
}

/** Synchronous read of the last fetched snapshot (useful as initial state). */
export function getOnChainPricesSnapshot(): OnChainPrices {
  return _latest;
}

async function fetchAll(): Promise<OnChainPrices> {
  const infos  = await conn().getMultipleAccountsInfo(FEED_KEYS);
  const nowSec = Math.floor(Date.now() / 1000);
  const out: OnChainPrices = {};

  for (let i = 0; i < FEED_IDS.length; i++) {
    const info = infos[i];
    // Need at least discriminator(8) + authority(32) + price(8) + publishedAt(8) = 56 bytes
    if (!info?.data || info.data.length < 56) continue;

    const buf         = Buffer.from(info.data);
    const priceLamps  = buf.readBigUInt64LE(PRICE_OFFSET);
    const publishedAt = Number(buf.readBigInt64LE(PRICE_OFFSET + 8));
    const price       = Number(priceLamps) / LAMPORTS;

    if (price <= 0) continue;

    out[FEED_IDS[i]] = {
      price,
      publishedAt,
      stale: nowSec - publishedAt > STALE_SECONDS,
    };
  }

  _latest = out;
  return out;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useOnChainPrices(): OnChainPrices {
  const [prices, setPrices] = useState<OnChainPrices>(_latest);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      try {
        const result = await fetchAll();
        if (mountedRef.current) setPrices(result);
      } catch (err) {
        console.warn('[useOnChainPrices]', err);
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(timer);
      mountedRef.current = false;
    };
  }, []);

  return prices;
}
