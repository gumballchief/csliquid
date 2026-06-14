'use client';

import { useState } from 'react';
import {
  usePositionsStore,
  PerpsPosition,
  ClosedTrade,
  selectTotalUnrealizedPnl,
  selectTotalMarginUsed,
} from '@/store/positionsStore';

type Tab = 'positions' | 'orders' | 'history';

export default function PortfolioPage() {
  const [tab, setTab] = useState<Tab>('positions');

  const positions    = usePositionsStore(s => s.positions);
  const tradeHistory = usePositionsStore(s => s.tradeHistory);
  const usdcBalance  = usePositionsStore(s => s.usdcBalance);
  const closePosition = usePositionsStore(s => s.closePosition);
  const resetAccount  = usePositionsStore(s => s.resetAccount);
  const totalPnl     = usePositionsStore(selectTotalUnrealizedPnl);
  const marginUsed   = usePositionsStore(selectTotalMarginUsed);
  const pnlPositive  = totalPnl >= 0;

  return (
    <main className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[13px] font-mono uppercase tracking-[0.08em] text-tx-text">Portfolio</h1>
          <p className="text-[11px] font-mono text-tx-muted mt-0.5">Open positions, orders, and trade history</p>
        </div>
        <button
          onClick={() => { if (confirm('Reset account to $10,000 and clear all positions?')) resetAccount(); }}
          className="text-[10px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-muted border border-tx-border hover:border-tx-border2 px-3 py-1.5 rounded-sm transition-colors"
        >
          Reset Account
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-tx-border rounded overflow-hidden mb-4">
        {[
          {
            label: 'Available Balance',
            value: `$${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            valueClass: 'text-tx-text',
          },
          {
            label: 'Unrealized PnL',
            value: `${pnlPositive ? '+' : ''}$${totalPnl.toFixed(2)}`,
            valueClass: pnlPositive ? 'text-tx-green' : 'text-tx-red',
          },
          { label: 'Margin Used',     value: `$${marginUsed.toFixed(2)}`, valueClass: 'text-tx-text' },
          { label: 'Open Positions',  value: positions.length.toString(), valueClass: 'text-tx-text' },
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
            {t === 'positions' && positions.length > 0 && (
              <span className="ml-1.5 text-[9px] font-mono bg-tx-raised border border-tx-border px-1.5 py-0.5">{positions.length}</span>
            )}
            {t === 'history' && tradeHistory.length > 0 && (
              <span className="ml-1.5 text-[9px] font-mono bg-tx-raised border border-tx-border px-1.5 py-0.5">{tradeHistory.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Positions */}
      {tab === 'positions' && (
        positions.length === 0 ? (
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
                {positions.map(p => (
                  <PortfolioPositionRow key={p.id} position={p} onClose={() => closePosition(p.id, p.markPrice)} />
                ))}
              </tbody>
            </table>
          </div>
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

function PortfolioPositionRow({ position: p, onClose }: { position: PerpsPosition; onClose: () => void }) {
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
