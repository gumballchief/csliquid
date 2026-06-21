import express from 'express';
import cron from 'node-cron';
import { INDEX_DEFINITIONS, INDEX_IDS, CS500_DIVISOR } from './indexes';
import { fetchCSFloat } from './fetchers/csfloat';
import { fetchSkinportAll, type SkinportResult } from './fetchers/skinport';
import { fetchSteamLowest } from './fetchers/steam';
import { computeIndexVwap } from './aggregator';
import { insertPrice, getLatestPrice, getPriceHistory, pruneOldRecords } from './db';
import type { ConstituentResult } from './types';

const PORT = Number(process.env.ORACLE_PORT ?? 3001);

// ── Helpers ────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ── Price update cycle ─────────────────────────────────────────────────────

async function updateIndex(
  indexId:     string,
  skinportMap: Map<string, SkinportResult>,
): Promise<void> {
  const def = INDEX_DEFINITIONS[indexId];

  const settled = await Promise.allSettled(
    def.constituents.map(async (c): Promise<ConstituentResult> => {
      const prices: number[] = [];
      let volume = 0;

      // CSFloat — up to 50 buy-now listings (individual listing prices)
      try {
        const cf = await fetchCSFloat(c.hashName);
        prices.push(...cf.prices);
        volume += cf.count;
      } catch (err) {
        console.warn(`[oracle] csfloat ${c.hashName}: ${(err as Error).message}`);
      }

      // Skinport — min and max listing prices
      const sp = skinportMap.get(c.hashName);
      if (sp) {
        prices.push(sp.minPrice);
        if (sp.maxPrice > sp.minPrice) prices.push(sp.maxPrice);
        volume += sp.quantity;
      }

      // Steam — lowest listing as additional data point
      try {
        const steam = await fetchSteamLowest(c.hashName);
        prices.push(steam.lowestPrice);
      } catch {
        // Steam optional
      }

      if (prices.length === 0) throw new Error(`no_prices: ${c.hashName}`);

      // Use median listing price (robust to outlier high/low asks).
      const price = median(prices);

      return { hashName: c.hashName, price, volume, staticWeight: c.staticWeight };
    }),
  );

  const successful: ConstituentResult[] = settled
    .filter((r): r is PromiseFulfilledResult<ConstituentResult> => r.status === 'fulfilled')
    .map(r => r.value);

  const failures = settled.filter(r => r.status === 'rejected').length;
  if (failures > 0) {
    console.warn(`[oracle] ${indexId}: ${failures} constituent(s) failed`);
  }

  if (successful.length === 0) {
    console.error(`[oracle] ${indexId}: all constituents failed — skipping`);
    return;
  }

  let rawPrice: number;
  let volume: number;

  if (indexId === 'cs500-index') {
    // CS500 methodology: sum of median listing prices / fixed divisor (DJIA-style).
    // This produces an index value ~$2,000–$5,000 — well above any single-weapon index.
    const sum = successful.reduce((s, c) => s + c.price, 0);
    rawPrice = sum / CS500_DIVISOR;
    volume   = successful.reduce((s, c) => s + c.price * c.volume, 0);
  } else {
    // Other indices: volume-weighted average price (VWAP) of constituent medians.
    const result = computeIndexVwap(successful);
    rawPrice = result.price;
    volume   = result.volume;
  }

  const prevRow = getLatestPrice(indexId);
  let price = rawPrice;

  if (prevRow && prevRow.price > 0) {
    if (indexId === 'cs500-index') {
      // CS500: tight ±3% clamp + EWMA α=0.05 for smooth index-like behaviour.
      const lo      = prevRow.price * 0.97;
      const hi      = prevRow.price * 1.03;
      const clamped = Math.min(Math.max(rawPrice, lo), hi);
      price         = prevRow.price * 0.95 + clamped * 0.05;
      if (rawPrice !== price) {
        console.info(
          `[oracle] cs500-index EWMA: raw=$${rawPrice.toFixed(2)} → smoothed=$${price.toFixed(2)} ` +
          `(prev=$${prevRow.price.toFixed(2)})`,
        );
      }
    } else {
      // Other indices: ±20% hard cap to absorb bad CSFloat/Skinport listings.
      const maxMove = prevRow.price * 0.20;
      if (Math.abs(rawPrice - prevRow.price) > maxMove) {
        price = prevRow.price + Math.sign(rawPrice - prevRow.price) * maxMove;
        console.warn(
          `[oracle] ${indexId}: price capped ${rawPrice.toFixed(2)} → ${price.toFixed(2)} ` +
          `(prev=${prevRow.price.toFixed(2)}, raw_move=${((rawPrice - prevRow.price) / prevRow.price * 100).toFixed(1)}%)`,
        );
      }
    }
  }

  insertPrice(indexId, price, volume, successful.length);

  console.log(
    `[oracle] ${indexId} → $${price.toFixed(2)}  ` +
    `(${successful.length}/${def.constituents.length} constituents)`,
  );
}

async function runCycle(): Promise<void> {
  console.log(`[oracle] ${new Date().toISOString()} — starting update cycle`);

  // One Skinport request covers every constituent across all indexes
  let skinportMap = new Map<string, SkinportResult>();
  try {
    skinportMap = await fetchSkinportAll();
    console.log(`[oracle] Skinport: ${skinportMap.size} items loaded`);
  } catch (err) {
    console.warn(`[oracle] Skinport unavailable: ${(err as Error).message}`);
  }

  await Promise.allSettled(INDEX_IDS.map(id => updateIndex(id, skinportMap)));

  pruneOldRecords(168); // keep 7 days of history
  console.log('[oracle] Cycle complete.');
}

// ── Express API ────────────────────────────────────────────────────────────

const app = express();

app.get('/api/price/:indexId', (req, res) => {
  const { indexId } = req.params;
  const def = INDEX_DEFINITIONS[indexId];

  if (!def) {
    res.status(400).json({ error: `Unknown index: ${indexId}` });
    return;
  }

  const row = getLatestPrice(indexId);
  if (!row) {
    res.status(503).json({ error: 'No data yet — oracle is warming up (first tick in ~60 s).' });
    return;
  }

  res.json({
    indexId:           row.index_id,
    name:              def.name,
    price:             row.price,
    volume:            row.volume,
    constituentsUsed:  row.constituents_used,
    totalConstituents: def.constituents.length,
    source:            row.source,
    fetchedAt:         row.fetched_at,
  });
});

app.get('/api/price/:indexId/history', (req, res) => {
  const { indexId } = req.params;

  if (!INDEX_DEFINITIONS[indexId]) {
    res.status(400).json({ error: `Unknown index: ${indexId}` });
    return;
  }

  const limit = Math.min(Number(req.query['limit'] ?? 1440), 10_000);
  res.json(getPriceHistory(indexId, limit));
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[oracle] Listening on http://localhost:${PORT}`);
});

// First tick immediately; then every 60 seconds via cron
runCycle().catch(err => console.error('[oracle] Initial cycle failed:', err));
cron.schedule('* * * * *', () => {
  runCycle().catch(err => console.error('[oracle] Cron cycle failed:', err));
});
