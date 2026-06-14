export interface OHLCCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Deterministic LCG so data is stable within a session
function makeLCG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

export function generateCandles(
  currentPrice: number,
  intervalHours: number,
  count: number,
): OHLCCandle[] {
  const candles: OHLCCandle[] = [];
  const now = Math.floor(Date.now() / 1000);
  const intervalSec = intervalHours * 3600;
  const rand = makeLCG(Math.round(currentPrice * 100) + intervalHours * 997 + count * 13);

  // Per-candle volatility scales with √(intervalHours) so timeframes look distinct.
  // 1H ≈ 0.5% body, 4H ≈ 1%, 1D ≈ 2.5%, 1W ≈ 6.5%
  const volBase = 0.005 * Math.sqrt(intervalHours);

  // Starting price deviation grows with timeframe — short charts hug current
  // price (recent history), long charts can start much further away.
  // 1H: ±2%,  4H: ±4%,  1D: ±10%,  1W: ±22%
  const startDev = Math.min(0.04 * Math.sqrt(intervalHours), 0.45);
  let price = currentPrice * (1 - startDev / 2 + rand() * startDev);
  price = Math.max(price, currentPrice * 0.40);

  // Mean-reversion strength — increases gently with candle size so longer
  // charts show clear convergence over time rather than an endless flat line.
  const driftK = 0.025 + 0.02 * Math.log2(intervalHours + 1);

  for (let i = count - 1; i >= 0; i--) {
    const time  = now - i * intervalSec;
    const drift = ((currentPrice - price) / currentPrice) * driftK;
    const vol   = volBase * (0.7 + rand() * 0.9); // 0.7×–1.6× base each candle
    const move  = price * (drift + (rand() - 0.47) * vol * 2);

    const open  = price;
    const close = Math.max(open + move, open * 0.85);
    const body  = Math.abs(close - open);
    const high  = Math.max(open, close) + body * (0.2 + rand() * 0.9);
    const low   = Math.min(open, close) - body * (0.2 + rand() * 0.9);

    candles.push({ time, open, high, low, close });
    price = close;
  }

  return candles;
}
