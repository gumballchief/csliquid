"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSkinportAll = fetchSkinportAll;
/**
 * Fetches the full CS2 item catalogue from Skinport in one request, then
 * returns a Map keyed by market_hash_name.  One API call covers all 40
 * index constituents, staying well within rate limits.
 */
async function fetchSkinportAll() {
    const res = await fetch('https://api.skinport.com/v1/items?app_id=730&currency=USD', { headers: { 'Accept': 'application/json' } });
    if (!res.ok)
        throw new Error(`skinport_http_${res.status}`);
    const items = (await res.json());
    const map = new Map();
    for (const item of items) {
        const minPrice = item.min_price ?? item.mean_price;
        const maxPrice = item.max_price ?? item.mean_price;
        if (minPrice && minPrice > 0) {
            map.set(item.market_hash_name, {
                minPrice,
                maxPrice: maxPrice && maxPrice > 0 ? maxPrice : minPrice,
                quantity: item.quantity ?? 0,
            });
        }
    }
    return map;
}
