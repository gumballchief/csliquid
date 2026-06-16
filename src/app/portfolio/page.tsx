'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useAuth } from '@/contexts/AuthContext';
import { useProgram } from '@/hooks/useProgram';
import { useToastStore } from '@/store/toastStore';
import {
  usePositionsStore,
  PerpsPosition,
  ClosedTrade,
  selectTotalUnrealizedPnl,
  selectTotalMarginUsed,
} from '@/store/positionsStore';
import {
  fetchUserAccountBalance,
  fetchOnChainPositions,
  sendClosePosition,
  sendClosePositionKeypair,
  extractErrorMessage,
  type OnChainPosition,
} from '@/lib/program';
import { fetchSkinPrice } from '@/services/skinPriceService';
import { decodeBase58 } from '@/lib/base58';
import { isMarketConfigured } from '@/lib/markets';

type Tab = 'positions' | 'orders' | 'history';

const PRICE_POLL_MS = 15_000;

export default function PortfolioPage() {
  const [tab, setTab] = useState<Tab>('positions');

  const { connected, publicKey } = useWallet();
  const { connection }           = useConnection();
  const { user }                 = useAuth();
  const program                  = useProgram();
  const addToast                 = useToastStore((s) => s.addToast);

  const [vaultBalance,    setVaultBalance]    = useState<number | null>(null);
  const [onChainPositions, setOnChainPositions] = useState<OnChainPosition[]>([]);
  const [markPrices,      setMarkPrices]      = useState<Record<string, number>>({});
  const [fetchingPos,     setFetchingPos]     = useState(false);

  const generatedPubkey = useMemo(
    () => user?.type === 'generated' ? new PublicKey(user.address) : null,
    [user],
  );
  const signerPubkey    = (connected && publicKey) ? publicKey : generatedPubkey;
  const isRealWallet    = signerPubkey !== null;
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setMounted(true); }, []);
  // Gate wallet-dependent JSX behind mounted so SSR and first client render match
  // (SSR: user=null → isRealWallet=false; client: user.type='generated' → isRealWallet=true)
  const showOnChain = mounted && isRealWallet;

  // Simulation store (pure guests only)
  const storePositions = usePositionsStore(s => s.positions);
  const tradeHistory   = usePositionsStore(s => s.tradeHistory);
  const usdcBalance    = usePositionsStore(s => s.usdcBalance);
  const closePosition  = usePositionsStore(s => s.closePosition);
  const resetAccount   = usePositionsStore(s => s.resetAccount);
  const totalStorePnl  = usePositionsStore(selectTotalUnrealizedPnl);
  const storeMargin    = usePositionsStore(selectTotalMarginUsed);

  // Fetch on-chain vault balance
  useEffect(() => {
    if (!signerPubkey) { setVaultBalance(null); return; }
    let cancelled = false;
    fetchUserAccountBalance(connection, signerPubkey)
      .then(b => { if (!cancelled) setVaultBalance(b ?? 0); })
      .catch(() => { if (!cancelled) setVaultBalance(0); });
    return () => { cancelled = true; };
  }, [connected, publicKey, generatedPubkey, connection]);

  // Fetch on-chain positions for real wallet users
  const refreshPositions = useCallback(async () => {
    if (!signerPubkey) { setOnChainPositions([]); return; }
    setFetchingPos(true);
    try {
      const pos = await fetchOnChainPositions(connection, signerPubkey);
      setOnChainPositions(pos);
    } catch {
      // leave previous state; silent fail
    } finally {
      setFetchingPos(false);
    }
  }, [connection, signerPubkey]);

  useEffect(() => {
    if (!isRealWallet) return;
    refreshPositions();
  }, [isRealWallet, refreshPositions]);

  // Poll mark prices for open on-chain positions
  useEffect(() => {
    if (!isRealWallet || onChainPositions.length === 0) return;

    const skinIds = Array.from(new Set(onChainPositions.map(p => p.priceSkinId)));

    const poll = async () => {
      const results = await Promise.allSettled(skinIds.map(id => fetchSkinPrice(id)));
      const prices: Record<string, number> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.markPrice > 0) {
          prices[skinIds[i]] = r.value.markPrice;
        }
      });
      setMarkPrices(prev => ({ ...prev, ...prices }));
    };

    poll();
    const timer = setInterval(poll, PRICE_POLL_MS);
    return () => clearInterval(timer);
  }, [isRealWallet, onChainPositions.length]);

  // Close an on-chain position
  const handleCloseOnChain = useCallback(async (pos: OnChainPosition) => {
    if (connected && publicKey && program && isMarketConfigured(pos.skinId)) {
      const sig = await sendClosePosition(program, publicKey, pos.skinId);
      addToast({ txSig: sig, action: 'close', skinName: pos.skinLabel });
      await refreshPositions();
      const b = await fetchUserAccountBalance(connection, publicKey).catch(() => null);
      if (b !== null) setVaultBalance(b);
      return;
    }
    if (user?.type === 'generated' && isMarketConfigured(pos.skinId)) {
      const kpRaw = localStorage.getItem('guest_keypair');
      if (!kpRaw) throw new Error('No trading keypair found — try logging out and back in');
      const signer = Keypair.fromSecretKey(decodeBase58(kpRaw));
      const sig = await sendClosePositionKeypair(connection, signer, pos.skinId);
      addToast({ txSig: sig, action: 'close', skinName: pos.skinLabel });
      await refreshPositions();
      const b = await fetchUserAccountBalance(connection, signer.publicKey).catch(() => null);
      if (b !== null) setVaultBalance(b);
      return;
    }
    throw new Error('Cannot close position — wallet not available');
  }, [connected, publicKey, program, user, connection, addToast, refreshPositions]);

  // Decide which positions to display
  const availBalance = showOnChain ? (vaultBalance ?? 0) : usdcBalance;

  // Summary stats from on-chain positions + live prices
  const totalOnChainPnl = onChainPositions.reduce((sum, p) => {
    const mark = markPrices[p.priceSkinId] ?? p.entryPrice;
    const pnl  = p.side === 'long'
      ? (mark - p.entryPrice) * p.size
      : (p.entryPrice - mark) * p.size;
    return sum + pnl;
  }, 0);
  const totalOnChainMargin = onChainPositions.reduce((s, p) => s + p.collateral, 0);

  const totalPnl   = showOnChain ? totalOnChainPnl  : totalStorePnl;
  const marginUsed = showOnChain ? totalOnChainMargin : storeMargin;
  const pnlPositive = totalPnl >= 0;
  const positionCount = showOnChain ? onChainPositions.length : storePositions.length;

  return (
    <main className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-tx-text">Portfolio</h1>
          <p className="text-[11px] font-mono text-tx-muted mt-0.5">Open positions, orders, and trade history</p>
        </div>
        {!showOnChain && (
          <button
            onClick={() => { if (confirm('Reset account to $5,000 and clear all positions?')) resetAccount(); }}
            className="text-[10px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-muted border border-tx-border hover:border-tx-border2 px-3 py-1.5 rounded-sm transition-colors"
          >
            Reset Account
          </button>
        )}
        {showOnChain && (
          <button
            onClick={() => refreshPositions()}
            disabled={fetchingPos}
            className="text-[10px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-muted border border-tx-border hover:border-tx-border2 px-3 py-1.5 rounded-sm transition-colors disabled:opacity-40"
          >
            {fetchingPos ? '…' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden mb-4">
        {[
          {
            label: 'Available Balance',
            value: `$${availBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            valueClass: 'text-tx-text',
          },
          {
            label: 'Unrealized PnL',
            value: `${pnlPositive ? '+' : ''}$${totalPnl.toFixed(2)}`,
            valueClass: pnlPositive ? 'text-tx-green' : 'text-tx-red',
          },
          { label: 'Margin Used',    value: `$${marginUsed.toFixed(2)}`, valueClass: 'text-tx-text' },
          { label: 'Open Positions', value: positionCount.toString(),     valueClass: 'text-tx-text' },
        ].map(({ label, value, valueClass }) => (
          <div key={label} className="bg-tx-surface px-4 py-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-tx-dim mb-1">{label}</p>
            <p className={`text-[16px] font-mono font-bold tabular-nums ${valueClass}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-px border-b border-tx-border mb-4">
        {(['positions', 'orders', 'history'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[10px] font-mono uppercase tracking-wider capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-tx-green text-tx-green' : 'border-transparent text-tx-dim hover:text-tx-muted'
            }`}
          >
            {t}
            {t === 'positions' && positionCount > 0 && (
              <span className="ml-1.5 text-[9px] font-mono bg-tx-raised border border-tx-border px-1.5 py-0.5">{positionCount}</span>
            )}
            {t === 'history' && tradeHistory.length > 0 && (
              <span className="ml-1.5 text-[9px] font-mono bg-tx-raised border border-tx-border px-1.5 py-0.5">{tradeHistory.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Positions */}
      {tab === 'positions' && (
        showOnChain ? (
          onChainPositions.length === 0 ? (
            <div className="text-center py-12 text-[11px] font-mono text-tx-dim uppercase tracking-wider">
              {fetchingPos ? 'Loading positions…' : 'No open positions'}
            </div>
          ) : (
            <div className="overflow-x-auto bg-tx-surface border border-tx-border rounded">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="border-b border-tx-border">
                    {['Market', 'Side', 'Size', 'Entry', 'Mark', 'Liq. Price', 'Lev.', 'Unrealized PnL', 'Collateral', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {onChainPositions.map(p => (
                    <OnChainPositionRow
                      key={p.positionPda}
                      position={p}
                      markPrice={markPrices[p.priceSkinId] ?? 0}
                      onClose={() => handleCloseOnChain(p)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          storePositions.length === 0 ? (
            <div className="text-center py-12 text-[11px] font-mono text-tx-dim uppercase tracking-wider">No open positions</div>
          ) : (
            <div className="overflow-x-auto bg-tx-surface border border-tx-border rounded">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="border-b border-tx-border">
                    {['Market', 'Side', 'Size', 'Entry', 'Mark', 'Liq. Price', 'Lev.', 'Unrealized PnL', 'Margin', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {storePositions.map(p => (
                    <SimPositionRow key={p.id} position={p} onClose={() => closePosition(p.id, p.markPrice)} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )
      )}

      {/* Orders */}
      {tab === 'orders' && (
        <div className="text-center py-12 text-[11px] font-mono text-tx-dim uppercase tracking-wider">
          No open orders
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        tradeHistory.length === 0 ? (
          <div className="text-center py-12 text-[11px] font-mono text-tx-dim uppercase tracking-wider">No trade history yet</div>
        ) : (
          <div className="overflow-x-auto bg-tx-surface border border-tx-border rounded">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr className="border-b border-tx-border">
                  {['Market', 'Side', 'Size', 'Entry', 'Exit', 'Realized PnL', 'Fee', 'Funding', 'Lev.', 'Closed'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tradeHistory.map(t => (
                  <HistoryRow key={t.id} trade={t} />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </main>
  );
}

// ── On-chain position row ─────────────────────────────────────────────────────

function OnChainPositionRow({
  position: p,
  markPrice,
  onClose,
}: {
  position: OnChainPosition;
  markPrice: number;
  onClose: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [closing,    setClosing]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const mark = markPrice > 0 ? markPrice : p.entryPrice;
  const unrealizedPnl = p.side === 'long'
    ? (mark - p.entryPrice) * p.size
    : (p.entryPrice - mark) * p.size;
  const unrealizedPnlPct = p.collateral > 0 ? (unrealizedPnl / p.collateral) * 100 : 0;
  const pnlPositive = unrealizedPnl >= 0;

  const nearLiq = p.side === 'long'
    ? mark <= p.liquidationPrice * 1.05
    : mark >= p.liquidationPrice * 0.95;

  const handleConfirmClose = async () => {
    setClosing(true);
    setError(null);
    try {
      await onClose();
      setConfirming(false);
    } catch (err) {
      setError(extractErrorMessage(err));
      setConfirming(false);
      setTimeout(() => setError(null), 5_000);
    } finally {
      setClosing(false);
    }
  };

  return (
    <tr className={`border-b border-tx-border transition-colors ${nearLiq ? 'bg-tx-red/5' : 'hover:bg-tx-raised'}`}>
      <td className="px-4 py-3">
        <p className="text-[11px] font-mono text-tx-text">{p.skinLabel}</p>
        <p className="text-[9px] font-mono text-tx-dim mt-0.5">
          PERP · {p.openedAt.toLocaleDateString()}
          <span className="ml-1 text-tx-green/50">· on-chain</span>
        </p>
      </td>
      <td className="px-4 py-3">
        <span className={`text-[9px] font-mono uppercase px-2 py-0.5 border ${
          p.side === 'long'
            ? 'bg-tx-green/10 border-tx-green/20 text-tx-green'
            : 'bg-tx-red/10 border-tx-red/20 text-tx-red'
        }`}>
          {p.side.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-muted tabular-nums">{p.size.toFixed(4)}</td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-dim tabular-nums">
        ${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-text tabular-nums">
        {markPrice > 0
          ? `$${mark.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : '…'}
        {nearLiq && <span className="ml-1 text-[10px] text-tx-red font-bold">⚠</span>}
      </td>
      <td className={`px-4 py-3 text-[11px] font-mono tabular-nums ${nearLiq ? 'text-tx-red' : 'text-tx-red/50'}`}>
        ${p.liquidationPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-muted tabular-nums">{p.leverage}×</td>
      <td className="px-4 py-3">
        {markPrice > 0 ? (
          <>
            <p className={`text-[11px] font-mono font-bold tabular-nums ${pnlPositive ? 'text-tx-green' : 'text-tx-red'}`}>
              {pnlPositive ? '+' : ''}${unrealizedPnl.toFixed(2)}
            </p>
            <p className={`text-[9px] font-mono tabular-nums ${pnlPositive ? 'text-tx-green/60' : 'text-tx-red/60'}`}>
              ({pnlPositive ? '+' : ''}{unrealizedPnlPct.toFixed(2)}%)
            </p>
          </>
        ) : (
          <span className="text-[11px] font-mono text-tx-dim">…</span>
        )}
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-dim tabular-nums">${p.collateral.toFixed(2)}</td>
      <td className="px-4 py-3">
        {error ? (
          <span className="text-[9px] font-mono text-tx-red">{error}</span>
        ) : confirming ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleConfirmClose}
              disabled={closing}
              className="text-[10px] font-mono uppercase text-tx-red bg-tx-red/10 hover:bg-tx-red/20 border border-tx-red/30 px-2.5 py-1 rounded-sm transition-colors disabled:opacity-50"
            >
              {closing ? '…' : 'Confirm'}
            </button>
            {!closing && (
              <button onClick={() => setConfirming(false)} className="text-[10px] font-mono text-tx-dim hover:text-tx-muted px-1.5 py-1 rounded-sm transition-colors">
                ✕
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-[10px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-text border border-tx-border hover:border-tx-border2 px-3 py-1 rounded-sm transition-colors"
          >
            Close
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Simulation position row (pure guests) ────────────────────────────────────

function SimPositionRow({ position: p, onClose }: { position: PerpsPosition; onClose: () => void }) {
  const pnlPositive = p.unrealizedPnl >= 0;
  const [confirming, setConfirming] = useState(false);
  const nearLiq = p.side === 'long'
    ? p.markPrice <= p.liquidationPrice * 1.05
    : p.markPrice >= p.liquidationPrice * 0.95;

  return (
    <tr className={`border-b border-tx-border transition-colors ${nearLiq ? 'bg-tx-red/5' : 'hover:bg-tx-raised'}`}>
      <td className="px-4 py-3">
        <p className="text-[11px] font-mono text-tx-text">{p.skin.name}</p>
        <p className="text-[9px] font-mono text-tx-dim mt-0.5">PERP · {new Date(p.openedAt).toLocaleDateString()}</p>
      </td>
      <td className="px-4 py-3">
        <span className={`text-[9px] font-mono uppercase px-2 py-0.5 border ${
          p.side === 'long'
            ? 'bg-tx-green/10 border-tx-green/20 text-tx-green'
            : 'bg-tx-red/10 border-tx-red/20 text-tx-red'
        }`}>
          {p.side.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-muted tabular-nums">{p.size.toFixed(4)}</td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-dim tabular-nums">
        ${p.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-text tabular-nums">
        ${p.markPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className={`px-4 py-3 text-[11px] font-mono tabular-nums ${nearLiq ? 'text-tx-red' : 'text-tx-red/50'}`}>
        ${p.liquidationPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        {nearLiq && <span className="ml-1 text-[10px] font-bold">⚠</span>}
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-muted tabular-nums">{p.leverage}×</td>
      <td className="px-4 py-3">
        <p className={`text-[11px] font-mono font-bold tabular-nums ${pnlPositive ? 'text-tx-green' : 'text-tx-red'}`}>
          {pnlPositive ? '+' : ''}${p.unrealizedPnl.toFixed(2)}
        </p>
        <p className={`text-[9px] font-mono tabular-nums ${pnlPositive ? 'text-tx-green/60' : 'text-tx-red/60'}`}>
          ({pnlPositive ? '+' : ''}{p.unrealizedPnlPct.toFixed(2)}%)
        </p>
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-dim tabular-nums">${p.margin.toFixed(2)}</td>
      <td className="px-4 py-3">
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { onClose(); setConfirming(false); }}
              className="text-[10px] font-mono uppercase text-tx-red bg-tx-red/10 hover:bg-tx-red/20 border border-tx-red/30 px-2.5 py-1 rounded-sm transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-[10px] font-mono text-tx-dim hover:text-tx-muted px-1.5 py-1 rounded-sm transition-colors"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-[10px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-text border border-tx-border hover:border-tx-border2 px-3 py-1 rounded-sm transition-colors"
          >
            Close
          </button>
        )}
      </td>
    </tr>
  );
}

function HistoryRow({ trade: t }: { trade: ClosedTrade }) {
  const pnlPositive = t.realizedPnl >= 0;
  const skinTitle   = t.skin.name.includes(' | ') ? t.skin.name.split(' | ')[1] : t.skin.name;
  return (
    <tr className="border-b border-tx-border hover:bg-tx-raised transition-colors">
      <td className="px-4 py-3">
        <p className="text-[11px] font-mono text-tx-text">{skinTitle}</p>
        {t.isLiquidation && (
          <p className="text-[9px] font-mono uppercase text-tx-red mt-0.5">LIQUIDATED</p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[9px] font-mono uppercase px-2 py-0.5 border ${
          t.side === 'long'
            ? 'bg-tx-green/10 border-tx-green/20 text-tx-green'
            : 'bg-tx-red/10 border-tx-red/20 text-tx-red'
        }`}>
          {t.side.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-muted tabular-nums">{t.size.toFixed(4)}</td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-dim tabular-nums">
        ${t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-muted tabular-nums">
        ${t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[11px] font-mono font-bold tabular-nums ${pnlPositive ? 'text-tx-green' : 'text-tx-red'}`}>
          {pnlPositive ? '+' : ''}${t.realizedPnl.toFixed(2)}
        </span>
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-dim tabular-nums">${t.closingFee.toFixed(4)}</td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-dim tabular-nums">
        {t.fundingAccrued >= 0 ? '+' : ''}${t.fundingAccrued.toFixed(4)}
      </td>
      <td className="px-4 py-3 text-[11px] font-mono text-tx-muted tabular-nums">{t.leverage}×</td>
      <td className="px-4 py-3 text-[10px] font-mono text-tx-dim tabular-nums">
        {new Date(t.closedAt).toLocaleString()}
      </td>
    </tr>
  );
}
