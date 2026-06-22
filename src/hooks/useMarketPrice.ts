'use client';

import { useMemo } from 'react';
import { useSkinPrice, type UseSkinPriceResult } from './useSkinPrice';
import { generateCandles } from '@/lib/generateCandles';
import type { PriceHistories, PriceRange } from '@/services/skinPriceService';

const RANGE_CFG: Record<PriceRange, { hours: number; count: number }> = {
  '1H': { hours: 1 / 60,  count: 120 },
  '4H': { hours: 5 / 60,  count: 288 },
  '1D': { hours: 0.5,     count: 336 },
  '1W': { hours: 4,       count: 720 },
};

/**
 * Single price source for the trade page.
 *
 * Wraps useSkinPrice and ensures candle histories are consistent:
 * - Candles are seeded from the live markPrice (stable per session)
 * - The last candle's close always equals markPrice
 * - Header, chart, and ticket all read from this one hook
 */
export function useMarketPrice(skinId: string): UseSkinPriceResult {
  const live = useSkinPrice(skinId);
  const { markPrice } = live;

  // Round to 2dp so minor API noise doesn't regenerate the whole history.
  // Only regenerates when price moves meaningfully (>$0.01 change).
  const priceSeed = Math.round(markPrice * 100);

  const histories = useMemo<PriceHistories>(() => {
    const price = priceSeed / 100;
    if (!price) return live.histories;

    // Use real histories if oracle provided them; otherwise generate from seed
    const hasReal = Object.values(live.histories).some(h => h.length > 0);
    const base: PriceHistories = hasReal
      ? live.histories
      : (Object.fromEntries(
          Object.entries(RANGE_CFG).map(([range, cfg]) => [
            range,
            generateCandles(price, cfg.hours, cfg.count),
          ])
        ) as PriceHistories);

    // Patch last candle so close === live markPrice across every range
    return Object.fromEntries(
      Object.entries(base).map(([range, bars]) => {
        if (!bars.length) return [range, bars];
        const last = bars[bars.length - 1];
        return [
          range,
          [
            ...bars.slice(0, -1),
            {
              ...last,
              close: price,
              high:  Math.max(last.high, price),
              low:   Math.min(last.low,  price),
            },
          ],
        ];
      })
    ) as PriceHistories;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinId, priceSeed]);

  return { ...live, histories };
}
