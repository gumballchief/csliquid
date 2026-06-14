'use client';

import { useSkinPrice } from '@/hooks/useSkinPrice';

export default function PriceTicker() {
  const awp   = useSkinPrice('awp-index');
  const ak47  = useSkinPrice('ak47-index');
  const knife = useSkinPrice('knife-index');
  const glove = useSkinPrice('glove-index');
  const cs500 = useSkinPrice('cs500-index');

  const data = [
    { label: 'AWP-PERP',   price: awp.markPrice,   pct: awp.changePct24h,   loading: awp.loading },
    { label: 'AK47-PERP',  price: ak47.markPrice,  pct: ak47.changePct24h,  loading: ak47.loading },
    { label: 'KNIFE-PERP', price: knife.markPrice, pct: knife.changePct24h, loading: knife.loading },
    { label: 'GLOVE-PERP', price: glove.markPrice, pct: glove.changePct24h, loading: glove.loading },
    { label: 'CS500-PERP', price: cs500.markPrice, pct: cs500.changePct24h, loading: cs500.loading },
  ];

  const items = (offset: number) =>
    data.map((item, i) => (
      <span key={offset + i} className="flex items-center">
        <span className="flex items-center gap-2 px-3 sm:px-4 whitespace-nowrap">
          <span className="text-tx-dim font-mono text-[10px] tracking-[0.08em] uppercase">{item.label}</span>
          <span className="text-tx-text font-mono text-[10px] sm:text-[11px] tabular-nums">
            {item.loading ? '—' : `$${item.price >= 1000 ? item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price.toFixed(2)}`}
          </span>
          {!item.loading && (
            <span className={`font-mono text-[10px] tabular-nums ${item.pct >= 0 ? 'text-tx-green' : 'text-tx-red'}`}>
              {item.pct >= 0 ? '+' : ''}{item.pct.toFixed(2)}%
            </span>
          )}
        </span>
        <span className="text-tx-border text-[10px] select-none">│</span>
      </span>
    ));

  return (
    <>
      <style>{`
        @keyframes csliquid-ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track { animation: csliquid-ticker 32s linear infinite; will-change: transform; }
        @media (max-width: 767px) {
          .ticker-track { animation-duration: 20s; }
        }
        .ticker-wrap:hover .ticker-track { animation-play-state: paused; }
      `}</style>
      <div className="ticker-wrap h-7 sm:h-8 bg-tx-deep border-b border-tx-border overflow-hidden flex items-center">
        <div className="ticker-track flex items-center">
          {items(0)}
          {items(100)}
        </div>
      </div>
    </>
  );
}
