export interface PricePoint {
  price:  number;
  volume: number; // listing count as liquidity proxy
}

export interface ConstituentResult {
  hashName:     string;
  price:        number;
  volume:       number;
  staticWeight: number;
}

export interface IndexPriceRow {
  id:                number;
  index_id:          string;
  price:             number;
  volume:            number;
  constituents_used: number;
  source:            string;
  fetched_at:        number;
}

export interface HistoryRow {
  price:      number;
  volume:     number;
  fetched_at: number;
}
