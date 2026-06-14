'use client';

import { useMarketPrice } from '@/hooks/useMarketPrice';
import PriceChart from './PriceChart';

interface Props {
  skinId:   string;
  skinName: string;
}

export default function LivePriceChart({ skinId, skinName }: Props) {
  const { markPrice, histories } = useMarketPrice(skinId);

  return (
    <PriceChart
      markPrice={markPrice}
      skinName={skinName}
      externalHistories={histories}
    />
  );
}
