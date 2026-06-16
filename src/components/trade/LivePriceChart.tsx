'use client';

import { useMarketPrice } from '@/hooks/useMarketPrice';
import PriceChart, { type ChartPosition } from './PriceChart';

interface Props {
  skinId:        string;
  skinName:      string;
  openPosition?: ChartPosition | null;
}

export default function LivePriceChart({ skinId, skinName, openPosition }: Props) {
  const { markPrice, histories } = useMarketPrice(skinId);

  return (
    <PriceChart
      markPrice={markPrice}
      skinName={skinName}
      externalHistories={histories}
      openPosition={openPosition}
    />
  );
}
