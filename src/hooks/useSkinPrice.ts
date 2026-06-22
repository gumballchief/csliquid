'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  fetchSkinPrice,
  getCached,
  SkinPriceData,
} from '@/services/skinPriceService';
import { useOnChainPrices } from '@/hooks/useOnChainPrices';

const POLL_INTERVAL_MS = 8_000;
const TICK_INTERVAL_MS = 1_000;
const TICK_NOISE       = 0.00025;
// Max oracle price change per update cycle — clamped to ±1% to prevent violent jumps.
const MAX_PRICE_CHANGE = 0.01;

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

  const tickPriceRef       = useRef<number>(0);
  const mountedRef         = useRef(true);
  const skinIdRef          = useRef(skinId);
  skinIdRef.current        = skinId;
  const realPriceRef       = useRef<number>(0);
  // Tracks the last publishedAt we acted on — prevents redundant setUpdated calls.
  const lastPublishedAtRef = useRef<number>(0);

  const [changePct24h, setChangePct24h] = useState<number>(0);

  // ── On-chain price (30-second poll, highest priority) ──────────────────
  const onChainPrices    = useOnChainPrices();
  const onChainPricesRef = useRef(onChainPrices);
  onChainPricesRef.current = onChainPrices;

  useEffect(() => {
    const ocp = onChainPrices[skinId];
    if (!ocp || ocp.price <= 0) return;

    // Skip when both price and timestamp are unchanged — prevents extra renders.
    const samePrice = ocp.price === realPriceRef.current;
    const sameTime  = ocp.publishedAt === lastPublishedAtRef.current;
    if (samePrice && sameTime) return;

    // Clamp to ±5% per oracle update to smooth out violent price jumps.
    const prev    = realPriceRef.current;
    const raw     = ocp.price;
    const clamped = prev > 0
      ? Math.min(Math.max(raw, prev * (1 - MAX_PRICE_CHANGE)), prev * (1 + MAX_PRICE_CHANGE))
      : raw;

    realPriceRef.current       = clamped;
    tickPriceRef.current       = clamped;
    lastPublishedAtRef.current = ocp.publishedAt;
    const nextMs = ocp.publishedAt * 1000;
    setUpdated(prev => (prev !== null && prev.getTime() === nextMs ? prev : new Date(nextMs)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChainPrices, skinId]);

  const doFetch = useCallback(async (showLoading = false) => {
    const id = skinIdRef.current;
    if (showLoading) setLoading(true);

    try {
      const result = await fetchSkinPrice(id);
      if (!mountedRef.current || skinIdRef.current !== id) return;
      setData(prev =>
        prev &&
        prev.markPrice === result.markPrice &&
        prev.source    === result.source    &&
        prev.changePct24h === result.changePct24h
          ? prev
          : result,
      );
      setError(null);
      if (result.markPrice > 0) {
        const ocp = onChainPricesRef.current[id];
        const hasChainPrice = ocp && ocp.price > 0;
        if (!hasChainPrice) {
          realPriceRef.current = result.markPrice;
          tickPriceRef.current = result.markPrice;
          const nextMs = result.fetchedAt;
          setUpdated(prev => (prev !== null && prev.getTime() === nextMs ? prev : new Date(nextMs)));
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

  const fallback = useMemo<SkinPriceData>(() => ({
    skinId,
    markPrice:    0,
    indexPrice:   0,
    change24h:    0,
    changePct24h: 0,
    high24h:      0,
    low24h:       0,
    volume24h:    0,
    fundingRate:  0,
    histories:    { '1m': [], '5m': [], '15m': [], '1h': [], '1d': [] },
    source:       'mock',
    fetchedAt:    0,
  }), [skinId]);

  const base       = data ?? fallback;
  const markPrice  = (tickPriceRef.current > 0 && base.markPrice > 0) ? tickPriceRef.current : base.markPrice;
  const indexPrice = markPrice * 0.9998;

  const refetch = useCallback(() => doFetch(true), [doFetch]);

  return {
    ...base,
    markPrice,
    indexPrice,
    changePct24h: changePct24h !== 0 ? changePct24h : base.changePct24h,
    loading,
    error,
    lastUpdated,
    refetch,
  };
}
