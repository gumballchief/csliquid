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

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const rows: { label: string; value: string; valueClass?: string; dim?: boolean }[] = [
    { label: 'Order Type',     value: orderType === 'market' ? 'Market' : orderType === 'stop' ? 'Stop' : 'Limit' },
    { label: 'Collateral',     value: `$${collateral.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC` },
    { label: 'Leverage',       value: `${leverage}×` },
    { label: 'Notional Value', value: `$${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
    { label: 'Position Size',  value: `${positionSize.toFixed(4)} units` },
    { label: 'Est. Entry',     value: `$${entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
    { label: 'Fee (2%)', value: `-$${takerFee.toFixed(2)}`, dim: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              isLong ? 'bg-green-900/70 text-green-400' : 'bg-red-900/70 text-red-400'
            }`}>
              {side.toUpperCase()}
            </span>
            <span className="text-sm font-semibold text-white">{skinName}</span>
            <span className="text-xs text-gray-500 font-mono bg-gray-800 px-1.5 py-0.5 rounded">{leverage}×</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded-md hover:bg-gray-800">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M13 1L1 13M1 1l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Rows */}
        <div className="px-5 py-1">
          {rows.map(({ label, value, valueClass, dim }) => (
            <div key={label} className="flex justify-between items-center py-2.5 border-b border-gray-800/40">
              <span className={`text-xs ${dim ? 'text-gray-600' : 'text-gray-400'}`}>{label}</span>
              <span className={`text-xs font-mono font-medium ${valueClass ?? (dim ? 'text-gray-500' : 'text-gray-200')}`}>
                {value}
              </span>
            </div>
          ))}
          {/* Liquidation price — highlighted */}
          <div className="flex justify-between items-center py-2.5">
            <span className="text-xs text-gray-400">Liquidation Price</span>
            <span className={`text-xs font-mono font-bold ${isLong ? 'text-red-400' : 'text-green-400'}`}>
              ${liqPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Risk warning */}
        <div className="mx-5 mb-3 px-3 py-2.5 bg-amber-950/30 border border-amber-800/30 rounded-lg">
          <p className="text-[11px] text-amber-400/80 leading-relaxed">
            Perpetual futures carry significant risk. Your position can be liquidated if the market moves against you by {(100 / leverage * 0.9).toFixed(1)}%.
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-sm font-medium text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
              isLong
                ? 'bg-green-600 hover:bg-green-500 active:bg-green-700 text-white shadow-lg shadow-green-950/50'
                : 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-lg shadow-red-950/50'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Awaiting wallet…
              </span>
            ) : (
              `Confirm ${isLong ? 'Long' : 'Short'} →`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
