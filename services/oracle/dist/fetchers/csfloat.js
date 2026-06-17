"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCSFloat = fetchCSFloat;
async function fetchCSFloat(hashName) {
    const params = new URLSearchParams({
        market_hash_name: hashName,
        type: 'buy_now',
        sort_by: 'lowest_price',
        limit: '50',
    });
    const res = await fetch(`https://csfloat.com/api/v1/listings?${params}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible)',
            'Accept': 'application/json',
        },
    });
    if (!res.ok)
        throw new Error(`csfloat_http_${res.status}: ${hashName}`);
    const body = (await res.json());
    return {
        prices: (body.data ?? []).map(l => l.price / 100),
        count: body.count ?? 0,
    };
}
