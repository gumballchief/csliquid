import LivePriceHeader from '@/components/trade/LivePriceHeader';
import TradePageClient from '@/components/trade/TradePageClient';
import OpenPositionsTable from '@/components/trade/OpenPositionsTable';
import { notFound } from 'next/navigation';
import { Skin } from '@/types';

interface Props {
  params: { skin: string };
}

const MARKETS: Record<string, { weapon: string; name: string }> = {
  'awp-index':   { weapon: 'AWP',   name: 'AWP Index'   },
  'ak47-index':  { weapon: 'AK-47', name: 'AK-47 Index' },
  'knife-index': { weapon: 'Knife', name: 'Knife Index'  },
  'glove-index': { weapon: 'Glove', name: 'Glove Index'  },
  'cs500-index': { weapon: 'CS500', name: 'CS500 Index'  },
};

export default function TradePage({ params }: Props) {
  const meta = MARKETS[params.skin];
  if (!meta) notFound();

  const skin: Skin = {
    id: params.skin, name: meta.name, weapon: meta.weapon,
    category: 'Index', wear: 'Factory New', rarity: 'Covert',
    float: 0, imageUrl: '', collection: '',
  };
  const skinTitle = meta.name;

  return (
    <main className="max-w-[1600px] mx-auto px-3 py-3 space-y-3">

      <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
        <LivePriceHeader skinId={params.skin} skinName={meta.name} />
      </div>

      <TradePageClient
        skinId={params.skin}
        skinName={meta.name}
        skinTitle={skinTitle}
        skin={skin}
      />

      <OpenPositionsTable />
    </main>
  );
}

export function generateStaticParams() {
  return Object.keys(MARKETS).map(skin => ({ skin }));
}
