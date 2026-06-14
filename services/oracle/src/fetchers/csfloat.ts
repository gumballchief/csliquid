interface CSFloatListing {
  price: number; // cents (USD × 100)
}

interface CSFloatResponse {
  data:  CSFloatListing[];
  count: number;
}

export interface CSFloatResult {
  /** Individual buy-now listing prices in USD. */
  prices: number[];
  /** Total active listings — used as a market-depth proxy for VWAP weighting. */
  count:  number;
}

export async function fetchCSFloat(hashName: string): Promise<CSFloatResult> {
  const params = new URLSearchParams({
    market_hash_name: hashName,
    type:             'buy_now',
    sort_by:          'lowest_price',
    limit:            '50',
  });

  const res = await fetch(`https://csfloat.com/api/v1/listings?${params}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible)',
      'Accept':     'application/json',
    },
  });

  if (!res.ok) throw new Error(`csfloat_http_${res.status}: ${hashName}`);

  const body = (await res.json()) as CSFloatResponse;

  return {
    prices: (body.data ?? []).map(l => l.price / 100),
    count:  body.count ?? 0,
  };
}
