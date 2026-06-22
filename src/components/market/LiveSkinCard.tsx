'use client';

import { useEffect, useRef, useState } from 'react';
import { useSkinPrice } from '@/hooks/useSkinPrice';
import { FuturesMarket } from '@/types';
import SkinCard from './SkinCard';

export default function LiveSkinCard({ market }: { market: FuturesMarket }) {
  const live    = useSkinPrice(market.skinId);
  const prevRef = useRef(0);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const p = live.markPrice;
    if (!p) return;
    const prev = prevRef.current;
    if (prev > 0 && Math.abs(p - prev) / prev > 0.00001) {
      setFlash(p > prev ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 800);
      return () => clearTimeout(t);
    }
    prevRef.current = p;
  }, [live.markPrice]);

  // Build 7-point sparkline from live 1D OHLC history, fall back to mock
  const liveHistory = live.histories['1d'];
  const priceHistory =
    liveHistory?.length >= 2
      ? liveHistory.slice(-7).map(c => c.close)
      : market.priceHistory;

  const enriched: FuturesMarket = {
    ...market,
    markPrice:         live.markPrice  > 0 ? live.markPrice      : market.markPrice,
    indexPrice:        live.indexPrice > 0 ? live.indexPrice     : market.indexPrice,
    priceChange24h:    live.markPrice  > 0 ? live.change24h      : market.priceChange24h,
    priceChangePct24h: live.markPrice  > 0 ? live.changePct24h   : market.priceChangePct24h,
    high24h:           live.high24h    > 0 ? live.high24h        : market.high24h,
    low24h:            live.low24h     > 0 ? live.low24h         : market.low24h,
    priceHistory,
  };

  const glowColor =
    flash === 'up'   ? 'rgba(74,222,128,0.30)' :
    flash === 'down' ? 'rgba(248,113,113,0.30)' :
    'transparent';

  return (
    <div
      className="rounded-xl transition-[box-shadow] duration-700 ease-out"
      style={{ boxShadow: `0 0 0 1px ${glowColor}, 0 0 20px ${glowColor}` }}
    >
      <SkinCard market={enriched} />
    </div>
  );
}
