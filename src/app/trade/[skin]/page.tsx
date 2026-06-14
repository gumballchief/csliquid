import LivePriceHeader from '@/components/trade/LivePriceHeader';
import LivePriceChart from '@/components/trade/LivePriceChart';
import TradeTicket from '@/components/trade/TradeTicket';
import Orderbook from '@/components/trade/Orderbook';
import RecentTrades from '@/components/trade/RecentTrades';
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 items-start">

        <LivePriceChart skinId={params.skin} skinName={meta.name} />

        <div className="flex flex-col gap-3">
          <TradeTicket skinId={params.skin} skin={skin} skinName={skinTitle} markPrice={0} />
          <Orderbook orderbook={{ asks: [], bids: [] }} markPrice={0} />
          <RecentTrades trades={[]} />
        </div>
      </div>

      <OpenPositionsTable />
    </main>
  );
}

export function generateStaticParams() {
  return Object.keys(MARKETS).map(skin => ({ skin }));
}
