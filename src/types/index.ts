export type SkinRarity = 'Consumer' | 'Industrial' | 'Mil-Spec' | 'Restricted' | 'Classified' | 'Covert' | 'Contraband';

export type SkinWear = 'Factory New' | 'Minimal Wear' | 'Field-Tested' | 'Well-Worn' | 'Battle-Scarred';

export type SkinCategory = 'Rifle' | 'Knife' | 'Pistol' | 'Index' | 'Glove' | 'Case';

export interface Skin {
  id: string;
  name: string;
  weapon: string;
  category: SkinCategory;
  wear: SkinWear;
  rarity: SkinRarity;
  float: number;
  imageUrl: string;
  collection: string;
}

export interface FuturesMarket {
  skinId: string;
  skin: Skin;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFunding: string;
  openInterest: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePct24h: number;
  high24h: number;
  low24h: number;
  priceHistory: number[];
}

export interface Position {
  id: string;
  skinId: string;
  skin: Skin;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  leverage: number;
  margin: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openedAt: string;
}

export interface Order {
  id: string;
  skinId: string;
  skin: Skin;
  side: 'long' | 'short';
  type: 'limit' | 'market';
  size: number;
  price?: number;
  leverage: number;
  status: 'open' | 'filled' | 'cancelled';
  createdAt: string;
}

export interface OrderbookEntry {
  price: number;
  size: number;
  total: number;
}

export interface Orderbook {
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
}

export interface Trade {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: string;
}
