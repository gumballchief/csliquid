import Link from 'next/link';
import { FuturesMarket } from '@/types';
import Sparkline from './Sparkline';

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)        return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000)         return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(2);
}

function fmtVol(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

interface Props {
  market: FuturesMarket;
}

export default function SkinCard({ market }: Props) {
  const { skin, markPrice, priceChange24h, priceChangePct24h, volume24h, openInterest, fundingRate, priceHistory } = market;
  const up = priceChangePct24h >= 0;
  const skinTitle = skin.name.includes(' | ') ? skin.name.split(' | ')[1] : skin.name;
  const isIndex = skin.category === 'Index';

  return (
    <Link href={`/trade/${skin.id}`} className="block group focus:outline-none">
      <article className="bg-tx-surface border border-tx-border rounded hover:border-tx-border2 transition-colors duration-150">

        {/* ── Header row ── */}
        <div className="px-3 pt-3 pb-2.5 flex items-start justify-between border-b border-tx-border">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            {skin.imageUrl && (
              <img
                src={skin.imageUrl}
                alt={skin.name}
                className="w-8 h-8 object-contain shrink-0 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-[0.06em] text-tx-green leading-none">
                {skin.weapon}{isIndex ? ' · INDEX' : ''}
              </p>
              <p className="text-[11px] text-tx-muted font-mono mt-1 truncate">{skinTitle}</p>
            </div>
          </div>
          <span className={`shrink-0 text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-sm ${
            up
              ? 'text-tx-green bg-tx-green/10'
              : 'text-tx-red bg-tx-red/10'
          }`}>
            {up ? '+' : ''}{priceChangePct24h.toFixed(2)}%
          </span>
        </div>

        {/* ── Price + sparkline ── */}
        <div className="px-3 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[22px] font-mono font-bold text-tx-text tabular-nums leading-none">
              ${fmt(markPrice)}
            </p>
            <p className={`text-[11px] font-mono tabular-nums mt-1.5 ${up ? 'text-tx-green' : 'text-tx-red'}`}>
              {up ? '+' : ''}${fmt(Math.abs(priceChange24h))}
            </p>
          </div>
          <Sparkline data={priceHistory} positive={up} width={80} height={40} />
        </div>

        {/* ── Stats strip ── */}
        <div className="px-3 pb-3 grid grid-cols-3 gap-1 border-t border-tx-border pt-2.5">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-0.5">VOL</p>
            <p className="text-[11px] font-mono text-tx-muted tabular-nums">{fmtVol(volume24h)}</p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-0.5">O.I.</p>
            <p className="text-[11px] font-mono text-tx-muted tabular-nums">{fmtVol(openInterest)}</p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.08em] text-tx-dim mb-0.5">FUND</p>
            <p className={`text-[11px] font-mono tabular-nums ${fundingRate >= 0 ? 'text-tx-green' : 'text-tx-red'}`}>
              {fundingRate >= 0 ? '+' : ''}{(fundingRate * 100).toFixed(4)}%
            </p>
          </div>
        </div>

        {/* ── Trade CTA ── */}
        <div className="border-t border-tx-border px-3 py-2 text-center text-[10px] font-mono uppercase tracking-[0.08em] text-tx-dim group-hover:text-tx-green transition-colors">
          Trade →
        </div>

      </article>
    </Link>
  );
}
