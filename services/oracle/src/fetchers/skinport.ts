interface SkinportItem {
  market_hash_name: string;
  min_price:        number | null;
  max_price:        number | null;
  mean_price:       number | null;
  quantity:         number | null;
}

export interface SkinportResult {
  price:    number;
  quantity: number;
}

/**
 * Fetches the full CS2 item catalogue from Skinport in one request, then
 * returns a Map keyed by market_hash_name.  One API call covers all 40
 * index constituents, staying well within rate limits.
 */
export async function fetchSkinportAll(): Promise<Map<string, SkinportResult>> {
  const res = await fetch(
    'https://api.skinport.com/v1/items?app_id=730&currency=USD',
    { headers: { 'Accept': 'application/json' } },
  );

  if (!res.ok) throw new Error(`skinport_http_${res.status}`);

  const items = (await res.json()) as SkinportItem[];
  const map   = new Map<string, SkinportResult>();

  for (const item of items) {
    const price = item.min_price ?? item.mean_price;
    if (price && price > 0) {
      map.set(item.market_hash_name, {
        price,
        quantity: item.quantity ?? 0,
      });
    }
  }

  return map;
}
