'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePositionsStore, PerpsPosition, selectTotalUnrealizedPnl } from '@/store/positionsStore';
import { useToastStore } from '@/store/toastStore';
import { useProgram } from '@/hooks/useProgram';
import { sendClosePosition, extractErrorMessage } from '@/lib/program';
import { isMarketConfigured } from '@/lib/markets';
import { fetchSkinPrice } from '@/services/skinPriceService';

const POLL_MS = 30_000;

export default function OpenPositionsTable() {
  const positions           = usePositionsStore((s) => s.positions);
  const closePosition       = usePositionsStore((s) => s.closePosition);
  const closeAllPositions   = usePositionsStore((s) => s.closeAllPositions);
  const updateMarkPrices    = usePositionsStore((s) => s.updateMarkPrices);
  const liquidateUnderwater = usePositionsStore((s) => s.liquidateUnderwater);
  const totalPnl            = usePositionsStore(selectTotalUnrealizedPnl);
  const pnlUp               = totalPnl >= 0;

  const { publicKey } = useWallet();
  const program       = useProgram();
  const addToast      = useToastStore((s) => s.addToast);

  // Poll mark prices for all open positions
  useEffect(() => {
    if (positions.length === 0) return;

    const refresh = async () => {
      const skinIds  = Array.from(new Set(positions.map((p) => p.skinId)));
      const results  = await Promise.allSettled(skinIds.map((id) => fetchSkinPrice(id)));
      const prices: Record<string, number> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.markPrice > 0) {
          prices[skinIds[i]] = r.value.markPrice;
        }
      });
      if (Object.keys(prices).length > 0) {
        updateMarkPrices(prices);
        liquidateUnderwater(prices);
      }
    };

    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length, updateMarkPrices, liquidateUnderwater]);

  const handleCloseAll = () => {
    const prices = Object.fromEntries(positions.map((p) => [p.skinId, p.markPrice]));
    closeAllPositions(prices);
  };

  const handleClosePosition = async (pos: PerpsPosition): Promise<void> => {
    if (program && publicKey && isMarketConfigured(pos.skinId)) {
      const sig = await sendClosePosition(program, publicKey, pos.skinId);
      addToast({ txSig: sig, action: 'close', skinName: pos.skin.name });
      closePosition(pos.id, pos.markPrice);
      return;
    }
    closePosition(pos.id, pos.markPrice);
  };

  return (
    <div style={{ background: '#111214', border: '1px solid #1e2025', borderRadius: 4 }} className="overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2025]">
        <div className="flex items-center gap-3">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#6b7280]">
            Open Positions
          </h2>
          {positions.length > 0 && (
            <>
              <span className="font-mono text-[9px] px-1.5 py-0.5 text-[#6b7280]"
                style={{ background: '#1e2025' }}>
                {positions.length}
              </span>
              <span className="hidden sm:block font-mono text-[10px] text-[#6b7280]">
                Total PnL:{' '}
                <span className={`font-bold ${pnlUp ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                  {pnlUp ? '+' : ''}${totalPnl.toFixed(2)}
                </span>
              </span>
            </>
          )}
        </div>
        {positions.length > 0 && (
          <button
            onClick={handleCloseAll}
            className="font-mono text-[10px] uppercase tracking-wider text-[#ff4444] hover:text-[#ff6666] border border-[#ff4444]/30 hover:border-[#ff4444]/60 px-3 py-1 transition-colors"
            style={{ borderRadius: 3 }}
          >
            Close All
          </button>
        )}
      </div>

      {/* Empty state */}
      {positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#374151]">
            No Open Positions
          </p>
          <p className="font-mono text-[10px] text-[#374151] mt-1.5">
            Place a trade above to open a position
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-[#1e2025]">
                  {[
                    { label: 'Market',     align: 'left'  },
                    { label: 'Direction',  align: 'left'  },
                    { label: 'Size',       align: 'right' },
                    { label: 'Entry',      align: 'right' },
                    { label: 'Mark',       align: 'right' },
                    { label: 'Liq Price',  align: 'right' },
                    { label: 'PNL',        align: 'right' },
                    { label: 'Close',      align: 'right' },
                  ].map(({ label, align }) => (
                    <th
                      key={label}
                      className={`px-4 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-[#6b7280] whitespace-nowrap text-${align}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <PositionRow
                    key={pos.id}
                    position={pos}
                    onClose={() => handleClosePosition(pos)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card view */}
          <div className="md:hidden divide-y divide-[#1e2025]">
            {positions.map((pos) => (
              <PositionCard
                key={pos.id}
                position={pos}
                onClose={() => handleClosePosition(pos)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PositionCard({
  position: p,
  onClose,
}: {
  position: PerpsPosition;
  onClose: () => Promise<void>;
}) {
  const pnlUp     = p.unrealizedPnl >= 0;
  const skinTitle = p.skin.name.includes(' | ') ? p.skin.name.split(' | ')[1] : p.skin.name;
  const [confirming, setConfirming] = useState(false);
  const [closing,    setClosing]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const nearLiq = p.side === 'long' ? p.markPrice <= p.liquidationPrice * 1.05 : p.markPrice >= p.liquidationPrice * 0.95;

  const handleConfirmClose = async () => {
    setClosing(true);
    setError(null);
    try { await onClose(); }
    catch (err) { setError(extractErrorMessage(err)); setConfirming(false); setTimeout(() => setError(null), 5_000); }
    finally { setClosing(false); }
  };

  return (
    <div className={`px-4 py-3 space-y-2.5 ${nearLiq ? 'bg-[#ff4444]/5' : ''}`}>
      {/* Top row: skin name + badge + PNL */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[12px] text-white">{skinTitle}</p>
          <p className="font-mono text-[9px] text-[#374151] mt-0.5">{p.skin.weapon} · {p.leverage}× · PERP</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-mono text-[13px] font-bold tabular-nums ${pnlUp ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {pnlUp ? '+' : ''}${p.unrealizedPnl.toFixed(2)}
          </p>
          <p className={`font-mono text-[10px] tabular-nums ${pnlUp ? 'text-[#00ff88]/70' : 'text-[#ff4444]/70'}`}>
            {pnlUp ? '+' : ''}{p.unrealizedPnlPct.toFixed(2)}%
          </p>
        </div>
      </div>
      {/* Detail grid */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="font-mono text-[9px] text-[#374151] uppercase tracking-wider">Direction</p>
          <span className={`inline-block font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 border mt-0.5 ${
            p.side === 'long' ? 'bg-[#00ff88]/10 border-[#00ff88]/20 text-[#00ff88]' : 'bg-[#ff4444]/10 border-[#ff4444]/20 text-[#ff4444]'
          }`}>{p.side.toUpperCase()}</span>
        </div>
        <div>
          <p className="font-mono text-[9px] text-[#374151] uppercase tracking-wider">Entry</p>
          <p className="font-mono text-[11px] text-[#6b7280] tabular-nums mt-0.5">${p.entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] text-[#374151] uppercase tracking-wider">Mark</p>
          <p className="font-mono text-[11px] text-white tabular-nums mt-0.5">${p.markPrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] text-[#374151] uppercase tracking-wider">Size</p>
          <p className="font-mono text-[11px] text-white tabular-nums mt-0.5">{p.size.toFixed(4)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] text-[#374151] uppercase tracking-wider">Liq. Price</p>
          <p className={`font-mono text-[11px] tabular-nums mt-0.5 ${nearLiq ? 'text-[#ff4444]' : 'text-[#ff4444]/50'}`}>
            ${p.liquidationPrice.toFixed(2)}
          </p>
        </div>
      </div>
      {/* Close button */}
      {error ? (
        <p className="font-mono text-[10px] text-[#ff4444]">{error}</p>
      ) : confirming ? (
        <div className="flex gap-2">
          <button
            onClick={handleConfirmClose}
            disabled={closing}
            className="flex-1 min-h-[44px] font-mono text-[11px] uppercase tracking-wider text-[#ff4444] border border-[#ff4444]/40 hover:bg-[#ff4444]/10 transition-colors disabled:opacity-50"
            style={{ borderRadius: 3 }}
          >
            {closing ? '…' : 'Confirm Close'}
          </button>
          {!closing && (
            <button onClick={() => setConfirming(false)} className="min-h-[44px] px-4 font-mono text-[11px] text-[#374151] hover:text-[#6b7280] transition-colors">
              ✕
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-full min-h-[44px] font-mono text-[11px] uppercase tracking-wider text-[#6b7280] hover:text-white border border-[#1e2025] hover:border-[#2a2d35] transition-colors"
          style={{ borderRadius: 3 }}
        >
          Close Position
        </button>
      )}
    </div>
  );
}

function PositionRow({
  position: p,
  onClose,
}: {
  position: PerpsPosition;
  onClose: () => Promise<void>;
}) {
  const pnlUp     = p.unrealizedPnl >= 0;
  const skinTitle = p.skin.name.includes(' | ') ? p.skin.name.split(' | ')[1] : p.skin.name;
  const [confirming, setConfirming] = useState(false);
  const [closing,    setClosing]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const nearLiq = (() => {
    if (p.side === 'long')  return p.markPrice <= p.liquidationPrice * 1.05;
    return p.markPrice >= p.liquidationPrice * 0.95;
  })();

  const handleConfirmClose = async () => {
    setClosing(true);
    setError(null);
    try {
      await onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
      setConfirming(false);
      setTimeout(() => setError(null), 5_000);
    } finally {
      setClosing(false);
    }
  };

  return (
    <tr
      className={`border-b border-[#1e2025]/60 transition-colors last:border-b-0 ${
        nearLiq ? 'bg-[#ff4444]/5' : 'hover:bg-[#161719]'
      }`}
    >
      {/* Market */}
      <td className="px-4 py-3">
        <p className="font-mono text-[11px] text-white">{skinTitle}</p>
        <p className="font-mono text-[9px] text-[#374151] mt-0.5">
          {p.skin.weapon} · {p.leverage}× · PERP
          {p.txSignature && (
            <span className="ml-1 text-[#00ff88]/50">· on-chain</span>
          )}
        </p>
      </td>

      {/* Direction */}
      <td className="px-4 py-3">
        <span
          className={`font-mono text-[9px] font-bold uppercase px-2 py-0.5 border ${
            p.side === 'long'
              ? 'bg-[#00ff88]/10 border-[#00ff88]/20 text-[#00ff88]'
              : 'bg-[#ff4444]/10 border-[#ff4444]/20 text-[#ff4444]'
          }`}
        >
          {p.side.toUpperCase()}
        </span>
      </td>

      {/* Size */}
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-[11px] text-white tabular-nums">{p.size.toFixed(4)}</span>
      </td>

      {/* Entry */}
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-[11px] text-[#6b7280] tabular-nums">
          ${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </td>

      {/* Mark */}
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-[11px] text-white tabular-nums">
          ${p.markPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        {nearLiq && (
          <p className="font-mono text-[9px] text-[#ff4444] mt-0.5">Near liq!</p>
        )}
      </td>

      {/* Liq. price */}
      <td className="px-4 py-3 text-right">
        <span className={`font-mono text-[11px] tabular-nums ${nearLiq ? 'text-[#ff4444]' : 'text-[#ff4444]/50'}`}>
          ${p.liquidationPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </td>

      {/* PNL */}
      <td className="px-4 py-3 text-right">
        <p className={`font-mono text-[11px] font-bold tabular-nums ${pnlUp ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
          {pnlUp ? '+' : ''}${p.unrealizedPnl.toFixed(2)}
        </p>
        <p className={`font-mono text-[9px] tabular-nums mt-0.5 ${pnlUp ? 'text-[#00ff88]/60' : 'text-[#ff4444]/60'}`}>
          {pnlUp ? '+' : ''}{p.unrealizedPnlPct.toFixed(2)}%
        </p>
      </td>

      {/* Close */}
      <td className="px-4 py-3 text-right">
        {error ? (
          <span className="font-mono text-[9px] text-[#ff4444] max-w-[100px] inline-block text-right leading-tight">
            {error}
          </span>
        ) : confirming ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={handleConfirmClose}
              disabled={closing}
              className="font-mono text-[10px] uppercase tracking-wider text-[#ff4444] border border-[#ff4444]/40 hover:bg-[#ff4444]/10 px-2.5 py-1 transition-colors disabled:opacity-50"
              style={{ borderRadius: 3 }}
            >
              {closing ? (
                <svg className="animate-spin h-3 w-3 inline" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : 'Confirm'}
            </button>
            {!closing && (
              <button
                onClick={() => setConfirming(false)}
                className="font-mono text-[10px] text-[#374151] hover:text-[#6b7280] px-1.5 py-1 transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="font-mono text-[10px] uppercase tracking-wider text-[#6b7280] hover:text-white border border-[#1e2025] hover:border-[#2a2d35] px-3 py-1 transition-colors"
            style={{ borderRadius: 3 }}
          >
            Close
          </button>
        )}
      </td>
    </tr>
  );
}
