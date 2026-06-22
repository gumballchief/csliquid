'use client';

import { useMarketPrice as useSkinPrice } from '@/hooks/useMarketPrice';

interface Props {
  skinId:   string;
  skinName: string;
}

const SOURCE_COLOR: Record<string, string> = {
  live:   'text-tx-green bg-tx-green/10',
  cached: 'text-yellow-400 bg-yellow-400/10',
  mock:   'text-tx-muted bg-tx-raised',
};

export default function LivePriceHeader({ skinId, skinName }: Props) {
  const { markPrice, indexPrice, change24h, changePct24h, high24h, low24h, volume24h, fundingRate, source, loading, lastUpdated } = useSkinPrice(skinId);

  const up = changePct24h >= 0;
  function fmtN(n: number) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 10_000)        return `${(n / 1_000).toFixed(1)}K`;
    if (n >= 1_000)         return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n.toFixed(2);
  }
  const fmtP = (n: number) => n === 0 && loading ? '—' : `$${fmtN(n)}`;

  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-tx-border bg-tx-surface">

      {/* Skin name */}
      <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-tx-muted shrink-0">{skinName}</span>

      {/* Mark price */}
      {loading && markPrice === 0
        ? <div className="h-6 w-24 bg-tx-raised animate-pulse rounded-sm" />
        : <span className="text-2xl font-mono font-bold text-tx-text tabular-nums leading-none">
            {fmtP(markPrice)}
          </span>
      }

      {/* 24h change */}
      {(!loading || changePct24h !== 0) && (
        <span className={`text-[12px] font-mono tabular-nums ${up ? 'text-tx-green' : 'text-tx-red'}`}>
          {up ? '+' : ''}${fmtN(Math.abs(change24h))} ({up ? '+' : ''}{changePct24h.toFixed(2)}%)
        </span>
      )}

      {/* Stats strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono ml-2">
        <span className="text-tx-dim">INDEX <span className="text-tx-muted tabular-nums">{fmtP(indexPrice)}</span></span>
        <span className="text-tx-dim">24H H <span className="text-tx-green tabular-nums">{fmtP(high24h)}</span></span>
        <span className="text-tx-dim">24H L <span className="text-tx-red tabular-nums">{fmtP(low24h)}</span></span>
        <span className="text-tx-dim">VOL <span className="text-tx-muted tabular-nums">{volume24h === 0 && loading ? '—' : `$${(volume24h / 1000).toFixed(1)}K`}</span></span>
        <span className="text-tx-dim">FUND <span className={fundingRate >= 0 ? 'text-tx-green' : 'text-tx-red'}>{(fundingRate * 100).toFixed(4)}%</span></span>
      </div>

      {/* Source + time */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {lastUpdated && <span className="text-[10px] font-mono text-tx-dim">{lastUpdated.toLocaleTimeString()}</span>}
        <span className={`text-[9px] font-mono uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-sm ${SOURCE_COLOR[source] ?? SOURCE_COLOR.mock}`}>
          {source}
        </span>
      </div>

    </div>
  );
}
