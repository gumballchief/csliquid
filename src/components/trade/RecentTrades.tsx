import { Trade } from '@/types';

interface Props {
  trades: Trade[];
}

export default function RecentTrades({ trades }: Props) {
  return (
    <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
      <div className="px-3 py-2 border-b border-tx-border">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.08em] text-tx-muted">Recent Trades</h3>
      </div>
      <div className="px-3 py-2">
        <div className="grid grid-cols-3 text-[10px] font-mono uppercase tracking-[0.05em] text-tx-dim mb-1.5">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Time</span>
        </div>
        <div className="space-y-px">
          {trades.map(trade => (
            <div key={trade.id} className="grid grid-cols-3 text-[11px] py-px">
              <span className={`font-mono tabular-nums ${trade.side === 'buy' ? 'text-tx-green' : 'text-tx-red'}`}>
                {trade.price.toFixed(2)}
              </span>
              <span className="text-tx-muted font-mono tabular-nums text-right">{trade.size.toFixed(1)}</span>
              <span className="text-tx-dim font-mono tabular-nums text-right">{trade.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
