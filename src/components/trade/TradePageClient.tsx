'use client';

import { useState } from 'react';
import LivePriceChart from './LivePriceChart';
import TradeTicket from './TradeTicket';
import Orderbook from './Orderbook';
import RecentTrades from './RecentTrades';
import type { ChartPosition } from './PriceChart';
import type { Skin } from '@/types';

interface Props {
  skinId:    string;
  skinName:  string;
  skinTitle: string;
  skin:      Skin;
}

export default function TradePageClient({ skinId, skinName, skinTitle, skin }: Props) {
  const [chartPos, setChartPos] = useState<ChartPosition | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 items-start">
      <LivePriceChart skinId={skinId} skinName={skinName} openPosition={chartPos} />

      <div className="flex flex-col gap-3">
        <TradeTicket
          skinId={skinId}
          skin={skin}
          skinName={skinTitle}
          markPrice={0}
          onPositionChange={setChartPos}
        />
        <Orderbook orderbook={{ asks: [], bids: [] }} markPrice={0} />
        <RecentTrades trades={[]} />
      </div>
    </div>
  );
}
