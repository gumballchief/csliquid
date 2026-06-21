export const dynamic = 'force-dynamic';

import LivePriceHeader from '@/components/trade/LivePriceHeader';
import TradePageClient from '@/components/trade/TradePageClient';
import OpenPositionsTable from '@/components/trade/OpenPositionsTable';
import { notFound } from 'next/navigation';
import { Skin } from '@/types';
import { getMarket } from '@/lib/allMarkets';

interface Props {
  params: { skin: string };
}

function typeToCategory(type: string): Skin['category'] {
  switch (type) {
    case 'index':  return 'Index';
    case 'rifle':  return 'Rifle';
    case 'pistol': return 'Pistol';
    case 'knife':  return 'Knife';
    case 'glove':  return 'Glove';
    case 'case':   return 'Case';
    default:       return 'Rifle';
  }
}

export default function TradePage({ params }: Props) {
  const market = getMarket(params.skin);
  if (!market) notFound();

  const skin: Skin = {
    id:         market.slug,
    name:       market.name,
    weapon:     market.ticker,
    category:   typeToCategory(market.type),
    wear:       'Factory New',
    rarity:     'Covert',
    float:      0,
    imageUrl:   market.iconUrl,
    collection: '',
  };

  return (
    <main className="max-w-[1600px] mx-auto px-3 py-3 space-y-3">

      {!market.onChain && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded px-4 py-2.5 flex items-center gap-2">
          <span className="text-yellow-400 text-[10px] font-mono uppercase tracking-wider">⚠ DEMO MARKET</span>
          <span className="text-[10px] font-mono text-tx-muted">
            Prices are live from Steam. On-chain trading launching soon.
          </span>
        </div>
      )}

      <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
        <LivePriceHeader skinId={params.skin} skinName={market.name} />
      </div>

      <TradePageClient
        skinId={params.skin}
        skinName={market.name}
        skinTitle={market.shortName}
        skin={skin}
        isDemo={!market.onChain}
      />

      <OpenPositionsTable />
    </main>
  );
}
