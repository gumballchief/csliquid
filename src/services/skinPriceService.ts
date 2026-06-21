/**
 * Client-side price service.
 *
 * Responsibilities:
 *  1. Call /api/skin-price and cache results (STALE_MS window)
 *  2. Maintain a snapshot ring-buffer per skin to calculate true 24h change
 *     once enough real data has accumulated; fall back to a seeded estimate
 *     until then so the UI always shows a value
 *  3. Build OHLC histories (one per time-range) anchored to the real price
 *  4. Return mock data if every API call has failed
 */

import { generateCandles, OHLCCandle } from '@/lib/generateCandles';
import { mockMarkets } from '@/lib/mockData';
import { isIndexId } from '@/lib/indexes';
import { ALL_MARKETS } from '@/lib/allMarkets';
import type { BulkIndexPrices } from '@/app/api/prices/route';

// ── Types ──────────────────────────────────────────────────────────────────

export type PriceRange = '1H' | '4H' | '1D' | '1W';
export type PriceSource = 'live' | 'cached' | 'mock';

export type PriceHistories = Record<PriceRange, OHLCCandle[]>;

export interface SkinPriceData {
  skinId:       string;
  markPrice:    number;
  indexPrice:   number;
  change24h:    number;
  changePct24h: number;
  high24h:      number;
  low24h:       number;
  volume24h:    number;
  fundingRate:  number;
  histories:    PriceHistories;
  source:       PriceSource;
  fetchedAt:    number; // Unix ms
}

interface Snapshot {
  price:     number;
  volume:    number;
  timestamp: number; // Unix ms
}

// ── Config ─────────────────────────────────────────────────────────────────

const STALE_MS     = 8_000;   // aggressive client refresh; server cache shields Steam
const SNAPSHOT_TTL = 26 * 3_600_000; // keep 26 h of snapshots

const RANGE_CFG: Record<PriceRange, { hours: number; count: number }> = {
  // interval (hours per candle) × count = total history window
  '1H': { hours: 1 / 60,   count: 240 },  // 1-min candles  → 4 hours of data
  '4H': { hours: 5 / 60,   count: 200 },  // 5-min candles  → ~17 hours of data
  '1D': { hours: 0.5,       count: 200 },  // 30-min candles → 4 days of data
  '1W': { hours: 4,         count: 210 },  // 4-hr candles   → 5 weeks of data
};

// ── Module-level stores (browser singleton) ────────────────────────────────

const priceCache    = new Map<string, SkinPriceData>();
const snapshots     = new Map<string, Snapshot[]>();
const historyAnchor = new Map<string, PriceHistories>();
const mockPrices    = new Map<string, number>();

// ── Bulk index price cache (one fetch updates all 4 indexes) ──────────────

/** Maps each index skinId to its key in the /api/prices response. */
const INDEX_BULK_KEY: Partial<Record<string, keyof Omit<BulkIndexPrices, 'updatedAt'>>> = {
  'awp-index':   'awp',
  'ak47-index':  'ak47',
  'knife-index': 'knife',
  'glove-index': 'glove',
  'cs500-index': 'cs500',
};

const BULK_STALE_MS = 8_000;  // match STALE_MS — prevents stale prices from causing false liquidations
let bulkCache: { data: BulkIndexPrices; ts: number } | null = null;
/** In-flight promise so concurrent calls share one fetch. */
let bulkFetchInFlight: Promise<BulkIndexPrices> | null = null;

async function fetchBulkPrices(): Promise<BulkIndexPrices> {
  if (bulkCache && Date.now() - bulkCache.ts < BULK_STALE_MS) return bulkCache.data;
  if (bulkFetchInFlight) return bulkFetchInFlight;

  bulkFetchInFlight = (async () => {
    try {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error(`/api/prices HTTP ${res.status}`);
      const data = await res.json() as BulkIndexPrices;
      if (data.ak47 > 0 || data.awp > 0 || data.knife > 0 || data.glove > 0) {
        bulkCache = { data, ts: Date.now() };
      }
      return data;
    } finally {
      bulkFetchInFlight = null;
    }
  })();

  return bulkFetchInFlight;
}

// ── Helpers ────────────────────────────────────────────────────────────────


function buildHistories(price: number): PriceHistories {
  return Object.fromEntries(
    Object.entries(RANGE_CFG).map(([range, cfg]) => [
      range,
      generateCandles(price, cfg.hours, cfg.count),
    ]),
  ) as PriceHistories;
}

/** Return anchored histories — regenerated if price moves >8% from anchor baseline. */
function getHistories(skinId: string, price: number): PriceHistories {
  const existing = historyAnchor.get(skinId);
  if (existing) {
    // Peek at the anchor baseline from the last candle close of the 1H range
    const h1 = existing['1H'];
    const anchorPrice = h1.length ? h1[Math.floor(h1.length / 2)].close : price;
    if (Math.abs(price - anchorPrice) / anchorPrice < 0.08) return existing;
    // Drift exceeded 8% — rebuild so chart stays centered on current price
    historyAnchor.delete(skinId);
  }
  historyAnchor.set(skinId, buildHistories(price));
  return historyAnchor.get(skinId)!;
}

function deriveChange(
  skinId: string,
  price:  number,
  snaps:  Snapshot[],
): { change24h: number; changePct24h: number } {
  if (snaps.length < 2) return { change24h: 0, changePct24h: 0 };

  // Find snapshot nearest to 24 h ago (within a ±30 min window)
  const target  = Date.now() - 86_400_000;
  const window  = 1_800_000;
  const match   = snaps.find(s => Math.abs(s.timestamp - target) < window);
  const base    = match ?? snaps[0]; // oldest available as proxy

  const change24h    = price - base.price;
  const changePct24h = (change24h / base.price) * 100;
  return { change24h, changePct24h };
}

function mockFallback(skinId: string): SkinPriceData {
  const m    = mockMarkets.find(x => x.skinId === skinId);
  // Use allMarkets approxPrice as fallback so DEMO skin/case perps show
  // realistic prices instead of the hardcoded $100 default.
  const marketDef = ALL_MARKETS.find(mk => mk.slug === skinId);
  const base = m?.markPrice ?? marketDef?.approxPrice ?? 100;

  // Apply a small random walk (±0.4% per poll) so prices move during testing
  // even when the oracle / external APIs are unreachable.
  const prev  = mockPrices.get(skinId) ?? base;
  const rawDrift = (Math.random() - 0.5) * 0.001; // ±0.05%
  // Mean reversion: pull back 0.1% per tick when >5% from target price
  const deviation = (prev - base) / base;
  const reversion = Math.abs(deviation) > 0.05 ? -deviation * 0.001 : 0;
  // Hard cap: no more than ±0.3% in one tick
  const totalDrift = Math.max(-0.003, Math.min(0.003, rawDrift + reversion));
  const p = Math.max(prev * (1 + totalDrift), 0.01);
  mockPrices.set(skinId, p);

  return {
    skinId,
    markPrice:    p,
    indexPrice:   p * 0.9998,
    change24h:    0,
    changePct24h: 0,
    high24h:      p * 1.004,
    low24h:       p * 0.997,
    volume24h:    0,
    fundingRate:  0,
    histories:    getHistories(skinId, p),
    source:       'mock',
    fetchedAt:    Date.now(),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Synchronous cache read — useful for avoiding loading flash on revisit. */
export function getCached(skinId: string): SkinPriceData | undefined {
  return priceCache.get(skinId);
}

export async function fetchSkinPrice(skinId: string): Promise<SkinPriceData> {
  const cached = priceCache.get(skinId);
  if (cached && Date.now() - cached.fetchedAt < STALE_MS) return cached;

  const mock = mockMarkets.find(x => x.skinId === skinId);

  try {
    // ── Fetch price ────────────────────────────────────────────────────────
    let price: number;
    let rawVolume = 0;

    const bulkKey = INDEX_BULK_KEY[skinId];
    if (bulkKey) {
      // All 4 main indexes share one /api/prices fetch (cached 55 s client-side)
      const bulk = await fetchBulkPrices();
      const p = bulk[bulkKey];
      if (!p || p <= 0) throw new Error(`/api/prices returned 0 for ${skinId}`);
      price = p;
    } else {
      // Individual skin or oracle-backed index (cs500, etc.)
      const endpoint = isIndexId(skinId)
        ? `/api/price/${encodeURIComponent(skinId)}`
        : `/api/skin-price?id=${encodeURIComponent(skinId)}`;

      const res = await fetch(endpoint);

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        price: number; median?: number; volume: number; source: string;
      };

      if (!data.price) throw new Error('API returned price=0');
      price     = data.price;
      rawVolume = data.volume;
    }

    // ── Update snapshot ring-buffer ────────────────────────────────────────
    const snaps = snapshots.get(skinId) ?? [];
    snaps.push({ price, volume: rawVolume, timestamp: Date.now() });
    snapshots.set(
      skinId,
      snaps.filter(s => Date.now() - s.timestamp < SNAPSHOT_TTL),
    );

    const { change24h, changePct24h } = deriveChange(skinId, price, snaps);
    const prevPrice = price - change24h;
    const high24h   = Math.max(price, prevPrice) * 1.004;
    const low24h    = Math.min(price, prevPrice) * 0.997;

    const result: SkinPriceData = {
      skinId,
      markPrice:    price,
      indexPrice:   price * 0.9998,
      change24h,
      changePct24h,
      high24h,
      low24h,
      volume24h:    rawVolume * price,
      fundingRate:  mock?.fundingRate ?? 0,
      histories:    getHistories(skinId, price),
      source:       'live',
      fetchedAt:    Date.now(),
    };

    priceCache.set(skinId, result);
    return result;
  } catch (err) {
    console.warn(`[skinPriceService] ${skinId}: ${(err as Error).message}`);

    // Return stale cache — if it was from mock/cached (not a real oracle hit),
    // apply a small drift so prices move during testing when oracle is down.
    if (cached) {
      let price = cached.markPrice;
      if (cached.source !== 'live') {
        const marketDef = ALL_MARKETS.find(mk => mk.slug === skinId);
        const mockMkt   = mockMarkets.find(x => x.skinId === skinId);
        const base      = mockMkt?.markPrice ?? marketDef?.approxPrice ?? price;
        const rawDrift  = (Math.random() - 0.5) * 0.001; // ±0.05%
        const deviation = (price - base) / base;
        const reversion = Math.abs(deviation) > 0.05 ? -deviation * 0.001 : 0;
        const totalDrift = Math.max(-0.003, Math.min(0.003, rawDrift + reversion));
        price = Math.max(price * (1 + totalDrift), 0.01);
        mockPrices.set(skinId, price);
      }
      const stale: SkinPriceData = {
        ...cached,
        markPrice:  price,
        indexPrice: price * 0.9998,
        source:     'cached',
        fetchedAt:  Date.now(),
      };
      priceCache.set(skinId, stale);
      return stale;
    }

    const fb = mockFallback(skinId);
    priceCache.set(skinId, fb);
    return fb;
  }
}
