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
const PRICE_OFFSET  = 40;
const LAMPORTS      = 1_000_000;
const STALE_SECONDS = 300;

const ID_TO_SKIN_KEY: Record<string, string> = {
  'AWP':   'awp-index',
  'AK47':  'ak47-index',
  'KNIFE': 'knife-index',
  'GLOVE': 'glove-index',
  'CS500': 'cs500-index',
};

const FEED_IDS  = INDEX_IDS as unknown as string[];
const FEED_KEYS = FEED_IDS.map(id => findPriceFeedPda(id));

export interface OnChainPrice {
  price:       number;
  publishedAt: number;
  stale:       boolean;
}

export type OnChainPrices = Partial<Record<string, OnChainPrice>>;

// ── Module-level singletons ────────────────────────────────────────────────

let _conn:        Connection | null          = null;
let _latest:      OnChainPrices             = {};
let _pendingPoll: Promise<OnChainPrices> | null = null;

function conn(): Connection {
  if (!_conn) _conn = new Connection(RPC_URL, 'confirmed');
  return _conn;
}

export function getOnChainPricesSnapshot(): OnChainPrices {
  return _latest;
}

/**
 * Fetches all price feeds in one RPC round-trip.
 * Deduplicated: concurrent callers share the same pending promise so only
 * one getMultipleAccountsInfo call goes out per 30-second cycle.
 * Returns the same `_latest` object reference when prices have not changed,
 * which lets React bail out of re-renders cheaply via Object.is.
 */
async function fetchAll(): Promise<OnChainPrices> {
  if (_pendingPoll) return _pendingPoll;

  _pendingPoll = (async () => {
    try {
      const infos  = await conn().getMultipleAccountsInfo(FEED_KEYS);
      const nowSec = Math.floor(Date.now() / 1000);
      const out: OnChainPrices = {};

      for (let i = 0; i < FEED_IDS.length; i++) {
        const info = infos[i];
        if (!info?.data || info.data.length < 56) continue;

        const buf         = Buffer.from(info.data);
        const priceLamps  = buf.readBigUInt64LE(PRICE_OFFSET);
        const publishedAt = Number(buf.readBigInt64LE(PRICE_OFFSET + 8));
        const price       = Number(priceLamps) / LAMPORTS;

        if (price <= 0) continue;

        const skinKey = ID_TO_SKIN_KEY[FEED_IDS[i]] ?? FEED_IDS[i];
        out[skinKey] = { price, publishedAt, stale: nowSec - publishedAt > STALE_SECONDS };
      }

      // Preserve object identity when nothing changed — avoids unnecessary re-renders.
      const changed =
        Object.keys(out).some(k => {
          const prev = _latest[k];
          const next = out[k]!;
          return !prev || prev.price !== next.price || prev.publishedAt !== next.publishedAt;
        }) ||
        Object.keys(_latest).some(k => !out[k]);

      if (changed) _latest = out;
      return _latest;
    } finally {
      _pendingPoll = null;
    }
  })();

  return _pendingPoll;
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
        // setPrices only schedules a re-render when result !== current prices.
        // Because fetchAll() returns the same _latest reference when unchanged,
        // React will bail out via Object.is and skip the re-render.
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
