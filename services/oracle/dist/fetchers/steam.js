"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSteamLowest = fetchSteamLowest;
function parseSteamPrice(raw) {
    if (!raw)
        return 0;
    const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
}
async function fetchSteamLowest(hashName) {
    const params = new URLSearchParams({ appid: '730', market_hash_name: hashName, currency: '1' });
    const res = await fetch(`https://steamcommunity.com/market/priceoverview/?${params.toString()}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok)
        throw new Error(`steam_http_${res.status}: ${hashName}`);
    const body = (await res.json());
    if (!body.success)
        throw new Error(`steam_no_data: ${hashName}`);
    const lowestPrice = parseSteamPrice(body.lowest_price);
    if (lowestPrice <= 0)
        throw new Error(`steam_parse_error: ${hashName}`);
    return { lowestPrice };
}
