"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectOutliers = rejectOutliers;
exports.computeIndexVwap = computeIndexVwap;
/**
 * Removes prices that lie more than 2 standard deviations from the mean.
 * Returns the original array unchanged when fewer than 3 prices are present
 * (not enough data for meaningful statistics).
 */
function rejectOutliers(prices) {
    if (prices.length < 3)
        return prices;
    const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
    const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0)
        return prices; // all identical — nothing to reject
    return prices.filter(p => Math.abs(p - mean) <= 2 * stdDev);
}
/**
 * Computes a volume-weighted average price across index constituents.
 *
 * Weight strategy:
 *   - Primary:  live volume (CSFloat listing count + Skinport quantity)
 *   - Fallback: static weights when all volumes are zero
 */
function computeIndexVwap(constituents) {
    const totalVolume = constituents.reduce((s, c) => s + c.volume, 0);
    if (totalVolume > 0) {
        const price = constituents.reduce((s, c) => s + c.price * c.volume, 0) / totalVolume;
        const volume = constituents.reduce((s, c) => s + c.price * c.volume, 0); // notional USD
        return { price, volume };
    }
    // Static-weight fallback
    const totalWeight = constituents.reduce((s, c) => s + c.staticWeight, 0);
    const price = constituents.reduce((s, c) => s + c.price * (c.staticWeight / totalWeight), 0);
    return { price, volume: 0 };
}
