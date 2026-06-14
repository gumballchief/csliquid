'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchSkinPrice,
  getCached,
  SkinPriceData,
} from '@/services/skinPriceService';

// How often we hit the API (server 30s cache absorbs Steam rate limits)
const POLL_INTERVAL_MS = 8_000;
// How often the displayed price ticks for visual liveness
const TICK_INTERVAL_MS = 1_000;
// Max noise per tick — ±0.025% — matches real CS2 market micro-movement
const TICK_NOISE = 0.00025;

export interface UseSkinPriceResult extends SkinPriceData {
  loading:     boolean;
  error:       string | null;
  lastUpdated: Date | null;
  refetch:     () => void;
}

export function useSkinPrice(skinId: string): UseSkinPriceResult {
  const [data, setData]           = useState<SkinPriceData | null>(() => getCached(skinId) ?? null);
  const [loading, setLoading]     = useState<boolean>(() => !getCached(skinId));
  const [error, setError]         = useState<string | null>(null);
  const [lastUpdated, setUpdated] = useState<Date | null>(
    () => { const c = getCached(skinId); return c ? new Date(c.fetchedAt) : null; },
  );

  // Tick state: displayed price drifts ±TICK_NOISE per second between real fetches
  const [tickPrice, setTickPrice] = useState<number>(0);

  const mountedRef  = useRef(true);
  const skinIdRef   = useRef(skinId);
  skinIdRef.current = skinId;
  // Real price anchor from the last successful API fetch
  const realPriceRef = useRef<number>(0);

  const doFetch = useCallback(async (showLoading = false) => {
    const id = skinIdRef.current;
    if (showLoading) setLoading(true);

    try {
      const result = await fetchSkinPrice(id);
      if (!mountedRef.current || skinIdRef.current !== id) return;
      setData(result);
      setError(null);
      setUpdated(new Date(result.fetchedAt));
      // Snap tick price to the fresh real price
      if (result.markPrice > 0) {
        realPriceRef.current = result.markPrice;
        setTickPrice(result.markPrice);
      }
    } catch (err) {
      if (!mountedRef.current || skinIdRef.current !== id) return;
      setError((err as Error).message);
    } finally {
      if (mountedRef.current && skinIdRef.current === id) setLoading(false);
    }
  }, []);

  // Poll API on mount + skinId change
  useEffect(() => {
    mountedRef.current = true;

    const cached = getCached(skinId);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      setUpdated(new Date(cached.fetchedAt));
      if (cached.markPrice > 0) {
        realPriceRef.current = cached.markPrice;
        setTickPrice(cached.markPrice);
      }
    } else {
      setData(null);
      setLoading(true);
    }

    doFetch();
    const timer = setInterval(() => doFetch(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 1-second micro-tick: random walk around the real price anchor
  useEffect(() => {
    const tick = setInterval(() => {
      const base = realPriceRef.current;
      if (base <= 0) return;
      setTickPrice(prev => {
        const current = prev > 0 ? prev : base;
        // Small noise + gentle mean-reversion so the display doesn't drift far
        const noise   = (Math.random() - 0.5) * 2 * TICK_NOISE;
        const revert  = (base - current) / base * 0.15; // pull 15% back toward anchor each tick
        return current * (1 + noise + revert);
      });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(tick);
  }, []);

  const fallback: SkinPriceData = {
    skinId,
    markPrice:    0,
    indexPrice:   0,
    change24h:    0,
    changePct24h: 0,
    high24h:      0,
    low24h:       0,
    volume24h:    0,
    fundingRate:  0,
    histories:    { '1H': [], '4H': [], '1D': [], '1W': [] },
    source:       'mock',
    fetchedAt:    0,
  };

  const base = data ?? fallback;

  // Use tick price when we have a live/cached real price; otherwise raw API value
  const markPrice  = (tickPrice > 0 && base.markPrice > 0) ? tickPrice : base.markPrice;
  const indexPrice = markPrice * 0.9998;

  return {
    ...base,
    markPrice,
    indexPrice,
    loading,
    error,
    lastUpdated,
    refetch: () => doFetch(true),
  };
}
