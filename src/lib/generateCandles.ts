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

  // Volatility scales with √(intervalMinutes) for realistic per-candle moves.
  // 1-min ≈ 0.03%, 5-min ≈ 0.07%, 30-min ≈ 0.17%, 4-hr ≈ 0.46%
  const intervalMin = intervalHours * 60;
  const volBase = 0.0003 * Math.sqrt(intervalMin);
  const MAX_CANDLE_MOVE = 0.003; // hard cap ±0.3% per candle

  // Starting deviation is small — history anchors close to the current price.
  const startDev = Math.min(0.015 * Math.sqrt(intervalMin), 0.15);
  let price = currentPrice * (1 - startDev / 2 + rand() * startDev);
  price = Math.max(price, currentPrice * 0.60);

  const driftK = 0.03 + 0.015 * Math.log2(intervalMin + 1);

  for (let i = count - 1; i >= 0; i--) {
    const time  = now - i * intervalSec;

    // Boost mean-reversion sharply when price drifts >5% from target.
    const deviation   = Math.abs(price - currentPrice) / currentPrice;
    const driftActual = deviation > 0.05 ? driftK * 4 : driftK;
    const drift = ((currentPrice - price) / currentPrice) * driftActual;

    const vol  = volBase * (0.7 + rand() * 0.9);
    let move   = price * (drift + (rand() - 0.47) * vol * 2);
    // Hard cap to ±0.3% per candle
    const cap  = price * MAX_CANDLE_MOVE;
    move = Math.max(-cap, Math.min(cap, move));

    const open  = price;
    const close = Math.max(open + move, open * 0.90);
    const body  = Math.abs(close - open);
    const high  = Math.max(open, close) + body * (0.2 + rand() * 0.9);
    const low   = Math.min(open, close) - body * (0.2 + rand() * 0.9);

    candles.push({ time, open, high, low, close });
    price = close;
  }

  // Last candle: add a small rejection wick in the opposite direction of the move
  const last = candles[candles.length - 1];
  if (last) {
    const rejectionWick = last.close * 0.003;
    if (last.close >= last.open) {
      // Green candle — small upper wick showing it went up then pulled back
      last.high = Math.max(last.high, last.close + rejectionWick);
    } else {
      // Red candle — small lower wick showing it went down then bounced
      last.low = Math.min(last.low, last.close - rejectionWick);
    }
  }

  return candles;
}
