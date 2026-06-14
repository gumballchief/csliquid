'use client';

import { Orderbook as OrderbookType } from '@/types';

interface Props {
  orderbook: OrderbookType;
  markPrice: number;
}

export default function Orderbook({ orderbook, markPrice }: Props) {
  const isEmpty  = orderbook.asks.length === 0 && orderbook.bids.length === 0;
  const maxTotal = isEmpty ? 1 : Math.max(
    ...orderbook.asks.map(a => a.total),
    ...orderbook.bids.map(b => b.total),
  );

  return (
    <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
      <div className="px-3 py-2 border-b border-tx-border">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.08em] text-tx-muted">Orderbook</h3>
      </div>

      {isEmpty ? (
        <div className="px-3 py-6 text-center text-[11px] font-mono text-tx-dim">No orders yet</div>
      ) : (
        <div className="px-3 pt-2">
          <div className="grid grid-cols-3 text-[10px] font-mono uppercase tracking-[0.05em] text-tx-dim mb-1.5">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Total</span>
          </div>

          <div className="space-y-px">
            {[...orderbook.asks].reverse().map((ask, i) => (
              <div key={i} className="relative grid grid-cols-3 text-[11px] py-px">
                <div className="absolute right-0 top-0 bottom-0 bg-tx-red/10" style={{ width: `${(ask.total / maxTotal) * 100}%` }} />
                <span className="text-tx-red font-mono tabular-nums relative z-10">{ask.price.toFixed(2)}</span>
                <span className="text-tx-muted font-mono tabular-nums text-right relative z-10">{ask.size.toFixed(1)}</span>
                <span className="text-tx-dim font-mono tabular-nums text-right relative z-10">{ask.total.toFixed(1)}</span>
              </div>
            ))}
          </div>

          <div className="py-1.5 text-center border-y border-tx-border my-1">
            <span className="text-[13px] font-bold font-mono tabular-nums text-tx-text">${markPrice.toFixed(2)}</span>
          </div>

          <div className="space-y-px pb-2">
            {orderbook.bids.map((bid, i) => (
              <div key={i} className="relative grid grid-cols-3 text-[11px] py-px">
                <div className="absolute right-0 top-0 bottom-0 bg-tx-green/10" style={{ width: `${(bid.total / maxTotal) * 100}%` }} />
                <span className="text-tx-green font-mono tabular-nums relative z-10">{bid.price.toFixed(2)}</span>
                <span className="text-tx-muted font-mono tabular-nums text-right relative z-10">{bid.size.toFixed(1)}</span>
                <span className="text-tx-dim font-mono tabular-nums text-right relative z-10">{bid.total.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
