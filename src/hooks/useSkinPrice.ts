'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchSkinPrice,
  getCached,
  SkinPriceData,
} from '@/services/skinPriceService';
import { useOnChainPrices } from '@/hooks/useOnChainPrices';

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

  // Ref for tick price — updated every second but does NOT trigger re-renders.
  // Components read the ref at render time (driven by the 8s API poll / 30s on-chain update).
  const tickPriceRef = useRef<number>(0);

  const mountedRef  = useRef(true);
  const skinIdRef   = useRef(skinId);
  skinIdRef.current = skinId;
  // Real price anchor — updated by on-chain poll (primary) or API fetch (fallback)
  const realPriceRef = useRef<number>(0);
  // 24-hour change computed from KV snapshot
  const [changePct24h, setChangePct24h] = useState<number>(0);

  // ── On-chain price (30-second poll, highest priority) ──────────────────
  const onChainPrices    = useOnChainPrices();
  // Ref so doFetch (stable callback) always sees the latest on-chain prices
  const onChainPricesRef = useRef(onChainPrices);
  onChainPricesRef.current = onChainPrices;

  useEffect(() => {
    const ocp = onChainPrices[skinId];
    if (!ocp || ocp.price <= 0) return;
    if (ocp.price === realPriceRef.current) return; // skip no-op updates
    realPriceRef.current = ocp.price;
    tickPriceRef.current = ocp.price;
    setUpdated(new Date(ocp.publishedAt * 1000));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChainPrices, skinId]);

  const doFetch = useCallback(async (showLoading = false) => {
    const id = skinIdRef.current;
    if (showLoading) setLoading(true);

    try {
      const result = await fetchSkinPrice(id);
      if (!mountedRef.current || skinIdRef.current !== id) return;
      setData(result);
      setError(null);
      // Snap tick price to API price only when no fresh on-chain price is available
      if (result.markPrice > 0) {
        const ocp = onChainPricesRef.current[id];
        const hasChainPrice = ocp && ocp.price > 0;
        if (!hasChainPrice) {
          realPriceRef.current = result.markPrice;
          tickPriceRef.current = result.markPrice;
          setUpdated(new Date(result.fetchedAt));
        }
      }
    } catch (err) {
      if (!mountedRef.current || skinIdRef.current !== id) return;
      setError((err as Error).message);
    } finally {
      if (mountedRef.current && skinIdRef.current === id) setLoading(false);
    }
  }, []);

  // Fetch 24h KV snapshot and compute real % change
  useEffect(() => {
    let cancelled = false;
    async function fetchChange() {
      try {
        const res  = await fetch(`/api/prices/change24h?market=${skinId}`);
        const json = await res.json() as { price24h?: number };
        if (cancelled || !json.price24h || json.price24h <= 0) return;
        const current = realPriceRef.current;
        if (current > 0) {
          setChangePct24h(((current - json.price24h) / json.price24h) * 100);
        }
      } catch { /* ignore */ }
    }
    fetchChange();
    const timer = setInterval(fetchChange, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [skinId]);


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
        tickPriceRef.current = cached.markPrice;
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

  // 1-second micro-tick: random walk around the real price anchor.
  // Updates a ref (not state) so it never causes a re-render by itself.
  // The animated value is read by callers at their next render (API poll / on-chain update).
  useEffect(() => {
    const tick = setInterval(() => {
      const base = realPriceRef.current;
      if (base <= 0) return;
      const current = tickPriceRef.current > 0 ? tickPriceRef.current : base;
      const noise   = (Math.random() - 0.5) * 2 * TICK_NOISE;
      const revert  = (base - current) / base * 0.15;
      tickPriceRef.current = current * (1 + noise + revert);
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

  // Use tick price (ref) when we have a live/cached real price; otherwise raw API value
  const markPrice  = (tickPriceRef.current > 0 && base.markPrice > 0) ? tickPriceRef.current : base.markPrice;
  const indexPrice = markPrice * 0.9998;

  return {
    ...base,
    markPrice,
    indexPrice,
    changePct24h: changePct24h !== 0 ? changePct24h : base.changePct24h,
    loading,
    error,
    lastUpdated,
    refetch: () => doFetch(true),
  };
}
