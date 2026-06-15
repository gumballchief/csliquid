'use client';

import { useEffect } from 'react';

interface Props {
  side: 'long' | 'short';
  skinName: string;
  orderType: 'market' | 'limit' | 'stop';
  leverage: number;
  collateral: number;
  notional: number;
  positionSize: number;
  entryPrice: number;
  liqPrice: number;
  takerFee: number;
  onConfirm: () => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export default function ReviewModal({
  side, skinName, orderType, leverage, collateral, notional,
  positionSize, entryPrice, liqPrice, takerFee,
  onConfirm, onClose, isSubmitting = false,
}: Props) {
  const isLong = side === 'long';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const orderLabel = orderType === 'market' ? 'Market' : orderType === 'stop' ? 'Stop' : 'Limit';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        className="relative w-full md:max-w-sm overflow-y-auto max-h-[100dvh] md:max-h-[90vh]"
        style={{ background: '#111214', border: '1px solid #1e2025', borderRadius: '4px 4px 0 0' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2025]">
          <div className="flex items-center gap-1.5">
            <span
              className="font-mono text-[12px] font-bold uppercase tracking-[0.12em]"
              style={{ color: isLong ? '#00ff88' : '#ff4444' }}
            >
              {side}
            </span>
            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
              · {skinName} · {leverage}× · {orderLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#374151] hover:text-[#6b7280] transition-colors"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">

          {/* ── Position summary box ── */}
          <div style={{ background: '#0a0b0d', border: '1px solid #2a2d35', borderRadius: 3 }}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1e2025]">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">
                Collateral
              </span>
              <span className="font-mono text-[13px] font-bold text-white tabular-nums">
                ${fmt(collateral)} <span className="text-[11px] font-normal text-[#6b7280]">USDC</span>
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">
                Notional
              </span>
              <span
                className="font-mono text-[13px] font-bold tabular-nums"
                style={{ color: isLong ? '#00ff88' : '#ff4444' }}
              >
                ${fmt(notional)}
              </span>
            </div>
          </div>

          {/* ── Data rows ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Size</span>
              <span className="font-mono text-[10px] text-[#e8eaed] tabular-nums">
                {positionSize.toFixed(4)} units
              </span>
            </div>
            <div className="flex items-center justify-between px-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Entry</span>
              <span className="font-mono text-[10px] text-[#e8eaed] tabular-nums">${fmt(entryPrice)}</span>
            </div>
            <div className="flex items-center justify-between px-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">Liq price</span>
              <span
                className="font-mono text-[10px] tabular-nums"
                style={{ color: isLong ? '#ff4444' : '#00ff88' }}
              >
                ${fmt(liqPrice)}
              </span>
            </div>
            <div className="flex items-center justify-between px-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7280]">
                Fee (0.05%)
              </span>
              <span className="font-mono text-[10px] text-[#6b7280] tabular-nums">
                -${takerFee.toFixed(2)}
              </span>
            </div>
          </div>

          {/* ── Risk line ── */}
          <p className="font-mono text-[10px] text-[#374151]">
            Position liquidates if price moves {(100 / leverage).toFixed(1)}% against you.
          </p>

          {/* ── Confirm button — matches Swap button exactly ── */}
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="w-full py-3 font-mono text-[11px] font-bold uppercase tracking-[0.12em] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
            style={{
              background: isLong ? '#00ff88' : '#ff4444',
              color:      isLong ? '#0a0b0d' : '#ffffff',
              borderRadius: 3,
            }}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Confirming…
              </span>
            ) : (
              `Confirm ${isLong ? 'Long' : 'Short'} →`
            )}
          </button>

          {/* ── Cancel — "Powered by Jupiter" style ── */}
          <p className="font-mono text-[10px] text-center text-[#374151]">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="hover:text-[#6b7280] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </p>

          {/* iOS safe-area */}
          <div className="md:hidden" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>
    </div>
  );
}
